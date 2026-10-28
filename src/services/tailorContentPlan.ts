import type { CVProfile } from '@/types/schema';
import type { TailorPatch, SourceEvidence } from './tailorModel';
export type ContentPlanRow={target:'summary'|'experience'|'projects'|'skills';entryId:string;bulletId:string;intent:'emphasize_result'|'clarify_scope'|'reduce_repetition'|'surface_relevance'|'organize_skills';jobQuote:string;evidence:SourceEvidence[]};
export const planIntentLabel:Record<ContentPlanRow['intent'],string>={emphasize_result:'Put the existing action and result first',clarify_scope:'Make the actual contribution clearer',reduce_repetition:'Remove repetition without losing facts',surface_relevance:'Surface existing evidence relevant to this requirement',organize_skills:'Group and prioritize existing skills; add no new skills'};
const key=(v:string)=>v.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
// Requirements and catalog have already passed source/quote checks. A valid
// reference establishes a passage relationship, NOT truth or semantic entailment.
export function checkContentPlan(source:CVProfile,patch:TailorPatch,requirements:{jobQuote:string;status:string;evidence:SourceEvidence[]}[],catalog:Map<string,SourceEvidence>){
 const plan:ContentPlanRow[]=[],seen=new Set<string>();let omitted=0;
 for(const row of patch.contentPlan){
  const assessment=requirements.find(r=>key(r.jobQuote)===key(row.jobQuote)&&r.status!=='not_found');
  const ids=row.evidenceIds,scope=`${row.target}:${row.entryId}:${row.bulletId}:${key(row.jobQuote)}`;
  let valid=!!assessment&&!!ids.length&&new Set(ids).size===ids.length&&ids.every(id=>catalog.has(id))&&!seen.has(scope)&&!!assessment?.evidence.some(e=>ids.includes(e.id));
  if(row.target==='summary')valid=valid&&!source.summary.isLocked&&!row.entryId&&!row.bulletId&&row.intent!=='organize_skills';
  else if(row.target==='skills')valid=valid&&!source.skills.isLocked&&!row.entryId&&!row.bulletId&&ids.every(id=>source.skills.data.some(s=>s.id===id))&&['surface_relevance','organize_skills'].includes(row.intent);
  else {const entry=source[row.target].data.find(e=>e.id===row.entryId),bullet=entry?.bullets.find(b=>b.id===row.bulletId);valid=valid&&!source[row.target].isLocked&&!!bullet&&ids.length===1&&ids[0]===bullet?.id&&row.intent!=='organize_skills';}
  if(!valid){omitted++;continue;}seen.add(scope);const {evidenceIds:_,...content}=row;plan.push({...content,evidence:ids.map(id=>catalog.get(id)!) });
 }
 return{plan,omitted};
}
export function planLinks(plan:ContentPlanRow[],target:ContentPlanRow['target'],entryId='',bulletId=''){
 return plan.flatMap((p,i)=>p.target===target&&p.entryId===entryId&&(!bulletId||p.bulletId===bulletId)?[i]:[]);
}
export function summaryPlanned(plan:ContentPlanRow[],ids:string[]){const rows=plan.filter(p=>p.target==='summary');return rows.length>0&&ids.every(id=>rows.some(r=>r.evidence.some(e=>e.id===id)));}
export function limitedWordingChange(before:string,after:string){
 const words=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu,' ').trim().split(/\s+/);
 const a=words(before),b=words(after);return a.length===b.length&&a.length>4&&a.slice(1).join(' ')===b.slice(1).join(' ');
}
