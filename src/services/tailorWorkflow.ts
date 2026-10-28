import { v4 as uuid } from 'uuid';
import { applyDraftAdditions } from '@/services/composer/applyDraft';
import { tailoringMetadataSchema } from '@/types/schema';
import type { CompositionDiagnostics } from '@/services/composer/diagnostics';
import { useAppStore, DEFAULT_DOCUMENT_THEME } from '@/store/useAppStore';
import { completeJobAssessment } from '@/services/composer/assessment';
import type { JobAssessment, CVProfile } from '@/types/schema';
import { applyTailorPatch, inputSignature, prepareTailorInput, TailorError, validateNewCopy, type SummaryAlternative } from './tailorModel';
import { persistedTailorChanges, selectTailorChanges, type CheckedTailorResult, type ReviewSelection } from './tailorReview';
import { requestTailor, saveTailorUsage, getTailorConnection, TAILOR_MODEL, type TokenUsage, type TailorUsageRecord } from './tailorRequest';
import { deriveCompositionReview, compositionDocument } from '@/services/composer/review';
import { evidenceQuestions, evidenceSourceCopy, independentSourceCopy } from './evidenceEnrichment';
export type { ReviewSelection } from './tailorReview';
export type TailoringPreview = {
  id:string; sourceId:string; sessionActiveId:string|null; sourceName:string; jobTitle:string;
  document?:ReturnType<typeof compositionDocument>; clarificationOnly?:boolean; originalSummary:string; changes:CheckedTailorResult['changes']; requirements:CheckedTailorResult['requirements'];
  diagnostics?:CompositionDiagnostics; diagnosticOnly?:boolean; jobAssessment?:JobAssessment; contentPlan?:CheckedTailorResult['contentPlan']; rejected:CheckedTailorResult['review']['rejected']; warnings:string[]; alternative?:SummaryAlternative;
};
type PendingReview={clarificationOnly?:boolean;id:string;source:CVProfile;snapshot:string;sessionActiveId:string|null;job:string;requestKey:string;result:CheckedTailorResult;jobAssessment?:JobAssessment;alternative?:SummaryAlternative};
let inFlight=false;let pending:PendingReview|undefined;
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
function assertSource(review:Pick<PendingReview,'source'|'snapshot'|'sessionActiveId'>) {
  const s=useAppStore.getState();
  if(s.activeProfileId!==review.sessionActiveId) throw new TailorError('stale','You switched resumes. No copy was created; discard this review and use the intended source.');
  const current=s.profiles.find(p=>p.profileId===review.source.profileId);
  if(!current||JSON.stringify(current)!==review.snapshot) throw new TailorError('stale','The source changed or was deleted. No copy was created; discard this review and generate from the updated source.');
}
export function discardTailoringReview(id:string) { if(pending?.id===id) pending=undefined; }
export async function prepareTailoredReview(sourceId:string,job:string,signal:AbortSignal):Promise<{reused:true;profileId:string}|{reused:false;preview:TailoringPreview}> {
  if(inFlight||pending) throw new TailorError('busy','A request or review is already open. Finish or discard it first.');
  if(signal.aborted) throw new TailorError('cancelled','Tailoring cancelled.');
  const original=useAppStore.getState().profiles.find(p=>p.profileId===sourceId);
  if(!original) throw new TailorError('source','The source no longer exists. Choose another resume.');
  prepareTailorInput(original,job);
  const snapshot=JSON.stringify(original),source:CVProfile=JSON.parse(snapshot),sessionActiveId=useAppStore.getState().activeProfileId;
  const id=uuid(),started=performance.now();let usage:TokenUsage={},status:TailorUsageRecord['status']='failed',reason:string|undefined,attempts=0;
  inFlight=true;
  try {
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([TAILOR_MODEL,source.profileId,snapshot,inputSignature(source,job)])));
    const requestKey=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(signal.aborted) throw new TailorError('cancelled','Tailoring cancelled.');
    const base={source,snapshot,sessionActiveId};assertSource(base);
    const existing=useAppStore.getState().profiles.find(p=>p.tailoring?.requestKey===requestKey);
    if(existing) {useAppStore.getState().setActiveProfile(existing.profileId);status='reused';return {reused:true,profileId:existing.profileId};}
    if(getTailorConnection().ready) attempts=1;
    const raw=await requestTailor(source,job,signal,measured=>{usage=measured;});
    if(signal.aborted) throw new TailorError('cancelled','Tailoring cancelled. No copy was created.');
    assertSource(base);
    const result=applyTailorPatch(source,raw.patch,job,{compositionMode:true});
    applyDraftAdditions(source,result,raw.draftOverviews,raw.draftOrders);
    deriveCompositionReview(source,result,raw.reasons);
    const jobAssessment=completeJobAssessment(raw.jobPassages,result.requirements,raw.warnings);
    result.review.rejected.push(...raw.blocked);result.review.proposedWording+=raw.blocked.length;result.review.rejectedWording+=raw.blocked.length;
    result.warnings=[...new Set([...raw.warnings,...result.warnings])];
    if(!result.changes.length&&!result.requirements.length&&!raw.diagnostics?.omitted.length) throw new TailorError('unchanged','No usable changes or evidence were returned. Your source is unchanged.');
    const alternative=undefined; // Sentence-level composition replaces the old generic fallback.
    pending={...base,id,job:job.trim(),requestKey,result,jobAssessment,alternative};
    status='success';
    // Detached preview only. No resume, active-profile or theme write here.
    return {reused:false,preview:clone({id,sourceId,sessionActiveId,sourceName:source.profileName,jobTitle:result.patch.jobTitle,document:compositionDocument(source,result),originalSummary:source.summary.data,changes:result.changes,diagnostics:raw.diagnostics,diagnosticOnly:!result.changes.length&&!result.requirements.length,jobAssessment,contentPlan:result.contentPlan,requirements:result.requirements,rejected:result.review.rejected,warnings:result.warnings,alternative})};
  } catch(error) {
    reason=error instanceof TailorError?error.code:'unexpected';status=signal.aborted||reason==='cancelled'?'cancelled':'failed';
    if(error instanceof TailorError) throw error;
    throw new TailorError('unexpected','The review could not be prepared. Your existing resumes are unchanged.');
  } finally {
    inFlight=false;saveTailorUsage({id,at:new Date().toISOString(),model:TAILOR_MODEL,elapsedMs:Math.round(performance.now()-started),attempts,status,reason,...usage});
  }
}
export function confirmTailoredReview(reviewId:string,selection:ReviewSelection) {
  if(!pending||pending.id!==reviewId) throw new TailorError('stale','This review is no longer available. No copy was created.');
  const review=pending;assertSource(review);
  if(!review.result.changes.length&&!review.result.requirements.length)throw new TailorError('unchanged','This response contains diagnostics only. No usable changes or assessment can be saved.');
  if(review.clarificationOnly)throw new TailorError('input','This local review is for supporting accounts only, not a new AI result.');
  const selected=selectTailorChanges(review.source,review.result,selection,review.alternative);
  const next=selected.copy,source=review.source;
  next.profileId=uuid();next.baseProfileId=source.profileId;
  next.profileName=`${source.profileName} — ${review.result.patch.jobTitle||'Reviewed'}`.slice(0,100);
  next.targetJob=review.job;delete next.matchScore;next.version=source.version+1;next.lastConfirmed='';
  next.documentTheme={...(source.documentTheme??DEFAULT_DOCUMENT_THEME)};
  next.tailoring={sourceProfileId:source.profileId,requestKey:review.requestKey,jobTitle:review.result.patch.jobTitle,company:review.result.patch.company,
    createdAt:new Date().toISOString(),model:TAILOR_MODEL,contentPlan:review.result.contentPlan,warnings:review.result.warnings,
    missingRequirements:review.result.requirements.filter(r=>r.status==='not_found').map(r=>r.requirement),requirements:review.result.requirements.slice(0,6).map(r=>({...r,evidence:r.evidence.slice(0,4)})),jobAssessment:review.jobAssessment,
    summaryEvidence:selected.summaryEvidence,changes:persistedTailorChanges(selected.changes),
    ...(tailoringMetadataSchema.shape.review.safeParse(selected.review).success?{review:selected.review}:{fullReview:selected.review})};
  if(review.result.requirements.slice(0,6).some(r=>r.evidence.length>4)) next.tailoring!.warnings=[...next.tailoring!.warnings,'Legacy compatibility snapshot keeps up to four references per requirement. The full job assessment retains all cited references.'];
  validateNewCopy(next);
  useAppStore.setState(state=>{
    if(pending?.id!==reviewId) throw new TailorError('stale','The review was discarded. No copy was created.');
    if(state.activeProfileId!==review.sessionActiveId || JSON.stringify(state.profiles.find(p=>p.profileId===source.profileId))!==review.snapshot) throw new TailorError('stale','The source or active resume changed. No copy was created.');
    return {profiles:[...state.profiles,next],activeProfileId:next.profileId,documentTheme:{...next.documentTheme!}};
  });
  pending=undefined;return {profileId:next.profileId};
}

// Explicit local action: retain source facts, discard the obsolete AI proposal,
// and make a separate source carrying user-reviewed supporting context only.
export function confirmEvidenceSource(reviewId:string,answers:unknown,confirmed:boolean){
  if(!pending||pending.id!==reviewId)throw new TailorError('stale','This review is no longer available. No evidence source was saved.');
  const review=pending;assertSource(review);
  const next=evidenceSourceCopy(review.source,evidenceQuestions(review.result.requirements),answers,confirmed);
  next.documentTheme={...(review.source.documentTheme??DEFAULT_DOCUMENT_THEME)};
  useAppStore.setState(state=>{
    if(pending?.id!==reviewId||state.activeProfileId!==review.sessionActiveId||JSON.stringify(state.profiles.find(p=>p.profileId===review.source.profileId))!==review.snapshot)throw new TailorError('stale','The source or review changed. No evidence source was saved.');
    return{profiles:[...state.profiles,next],activeProfileId:next.profileId,documentTheme:{...next.documentTheme!}};
  });pending=undefined;return{profileId:next.profileId};
}
export function copyWithoutSupportingEvidence(sourceId:string){
  if(inFlight||pending)throw new TailorError('busy','Finish or discard the current request/review first.');
  const state=useAppStore.getState(),source=state.profiles.find(p=>p.profileId===sourceId);
  if(!source?.supportingEvidence?.length)throw new TailorError('source','No supporting evidence is present in this source.');
  const snapshot=JSON.stringify(source),activeId=state.activeProfileId,next=independentSourceCopy(source,'Without supporting evidence');
  delete next.supportingEvidence;next.documentTheme={...(source.documentTheme??DEFAULT_DOCUMENT_THEME)};validateNewCopy(next);
  useAppStore.setState(current=>{
    if(current.activeProfileId!==activeId||JSON.stringify(current.profiles.find(p=>p.profileId===sourceId))!==snapshot)throw new TailorError('stale','The source changed. No copy was created.');
    return{profiles:[...current.profiles,next],activeProfileId:next.profileId,documentTheme:{...next.documentTheme!}};
  });return{profileId:next.profileId};
}

// Reopen questions from an existing assessment without another provider call.
// Historical status labels are not recomputed or represented as fresh analysis.
export function prepareSavedEvidenceReview(savedId:string,sourceId:string,job:string):TailoringPreview{
  if(inFlight||pending)throw new TailorError('busy','Finish or discard the current review first.');
  const state=useAppStore.getState(),saved=state.profiles.find(p=>p.profileId===savedId),original=state.profiles.find(p=>p.profileId===sourceId);
  if(!saved?.tailoring||!original||state.activeProfileId!==savedId||saved.tailoring.sourceProfileId!==sourceId||saved.targetJob?.trim()!==job.trim())throw new TailorError('stale','Use the saved job text and its original source to clarify this saved assessment. No request was sent.');
  const requirements=saved.tailoring.requirements??[];
  if(!evidenceQuestions(requirements).length)throw new TailorError('input','This saved assessment has no requirements needing clarification.');
  const source:CVProfile=clone(original),snapshot=JSON.stringify(original),sessionActiveId=state.activeProfileId,id=uuid();
  const result=applyTailorPatch(source,{jobTitle:saved.tailoring.jobTitle,company:saved.tailoring.company,summary:'',bullets:[],skillOrder:[],missingRequirements:[]});
  result.requirements=clone(requirements);result.warnings=['Questions come from a saved assessment, not a fresh analysis. No AI request was made.'];
  pending={clarificationOnly:true,id,source,snapshot,sessionActiveId,job:job.trim(),requestKey:saved.tailoring.requestKey,result};
  return clone({clarificationOnly:true,id,sourceId,sessionActiveId,sourceName:source.profileName,jobTitle:result.patch.jobTitle,document:compositionDocument(source,result),originalSummary:source.summary.data,changes:[],requirements:result.requirements,rejected:[],warnings:result.warnings});
}
