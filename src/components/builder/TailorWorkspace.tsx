import { JobAssessmentView } from './JobAssessmentView';
import { initialReviewSelection } from '@/services/tailorReview';
import { useEffect, useRef, useState } from 'react';
import { ContentPlanView, ChangePlanLinks } from './TailorContentPlan';
import { Check, CheckCircle2, FileText, Info, Loader2, Sparkles, Upload, X } from 'lucide-react';
import type { ImportMetadata } from '@/types/schema';
import { useAppStore } from '@/store/useAppStore';
import { JOB_LIMIT, resolveTailorSource, TailorError } from '@/services/tailorModel';
import { getTailorConnection, readLatestTailorUsage } from '@/services/tailorRequest';
import { prepareTailoredReview, confirmTailoredReview, discardTailoringReview, confirmEvidenceSource, copyWithoutSupportingEvidence, type TailoringPreview, type ReviewSelection } from '@/services/tailorWorkflow';
import type { EvidenceAnswer } from '@/services/evidenceEnrichment';
import { TailorReviewPanel } from './TailorReviewPanel';

const DRAFT_KEY = 'cv-tailor-job-draft-v1';

export function TailorWorkspace({ onCreated, onEditOriginal, onImport, onReviewImport }: { onCreated: () => void; onEditOriginal: () => void; onImport: () => void; onReviewImport: (data: ImportMetadata) => void }) {
  const profiles = useAppStore(s => s.profiles);
  const activeId = useAppStore(s => s.activeProfileId);
  const setActiveProfile = useAppStore(s => s.setActiveProfile);
  const active = profiles.find(p => p.profileId === activeId);
  const defaultSource = active ? resolveTailorSource(active, profiles) : undefined;
  const [choice, setChoice] = useState<{ activeId: string; sourceId: string } | null>(null);
  const source = choice?.activeId === activeId ? profiles.find(p => p.profileId === choice.sourceId) : defaultSource?.source;
  const [draft, setDraft] = useState(() => {
    try { return (localStorage.getItem(DRAFT_KEY) ?? '').slice(0, JOB_LIMIT); }
    catch { return ''; }
  });
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [evidenceOpen,setEvidenceOpen]=useState(false);
  const [preview, setPreview] = useState<TailoringPreview | null>(null);
  const [selection, setSelection] = useState<ReviewSelection>({selectedChanges:[],summary:'original'});
  const pendingId=useRef<string|null>(null);
  const reviewRegion=useRef<HTMLElement>(null);
  const [message, setMessage] = useState('');
  const [reused, setReused] = useState(false);
  const [latestUsage, setLatestUsage] = useState(readLatestTailorUsage);
  const inputs = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); if(pendingId.current) discardTailoringReview(pendingId.current); }, []);
  useEffect(()=>{if(preview && activeId!==preview.sessionActiveId){discardTailoringReview(preview.id);pendingId.current=null;setPreview(null);setEvidenceOpen(false);setMessage('The active resume changed. The pending review was discarded without saving a copy.');}},[activeId,preview]);
  const discard=()=>{if(preview) discardTailoringReview(preview.id);pendingId.current=null;setPreview(null);setEvidenceOpen(false);setMessage('Review discarded. No copy was created.');};
  const confirm=()=>{
    if(!preview||evidenceOpen||preview.clarificationOnly) return;
    try {confirmTailoredReview(preview.id,selection);pendingId.current=null;setPreview(null);setEvidenceOpen(false);setMessage('');onCreated();}
    catch(error){setMessage(error instanceof TailorError?error.message:'Could not save this review. Your source is unchanged.');requestAnimationFrame(()=>inputs.current?.scrollTo({top:0,behavior:'instant'}));}
  };
  const editOriginal=()=>{if(!preview)return;const id=preview.sourceId;discardTailoringReview(preview.id);pendingId.current=null;setPreview(null);setEvidenceOpen(false);setActiveProfile(id);setMessage('Add only real tasks, tools and outcomes to the original, then generate a new review. No request was sent.');onEditOriginal();};
  const saveEvidence=(answers:EvidenceAnswer[],confirmed:boolean)=>{
    if(!preview)throw new TailorError('stale','This review is no longer available.');
    confirmEvidenceSource(preview.id,answers,confirmed);pendingId.current=null;setPreview(null);setEvidenceOpen(false);setReused(false);
    setMessage('Evidence source copy saved locally. The original and CV body are unchanged. No AI request was sent. Review the supporting evidence below, then press Tailor CV only when ready.');
    requestAnimationFrame(()=>inputs.current?.scrollTo({top:0,behavior:'instant'}));
  };
  const removeEvidence=()=>{
    if(!source)return;
    try{copyWithoutSupportingEvidence(source.profileId);setReused(false);setMessage('A separate source copy without supporting evidence was created. Existing resumes were not changed. No AI request was sent.');requestAnimationFrame(()=>inputs.current?.scrollTo({top:0,behavior:'instant'}));}
    catch(e){setMessage(e instanceof TailorError?e.message:'Could not create the source copy. Existing resumes are unchanged.');}
  };
  const updateDraft = (value: string) => {
    setDraft(value); setMessage(''); setReused(false);
    try {
      if (value) localStorage.setItem(DRAFT_KEY, value);
      else localStorage.removeItem(DRAFT_KEY);
      setSaveError(false);
    } catch { setSaveError(true); }
  };
  const connection = getTailorConnection();
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const result = active?.tailoring;
  const generate = async () => {
    if (!source || controller.current || preview) return;
    const task = new AbortController(); controller.current = task;
    setBusy(true); setMessage(''); setReused(false);
    try {
      const created = await prepareTailoredReview(source.profileId, draft, task.signal);
      if (task.signal.aborted && !created.reused) discardTailoringReview(created.preview.id);
      if (!task.signal.aborted) {
        setReused(created.reused);
        if(created.reused) onCreated();
        else {
          pendingId.current=created.preview.id;setPreview(created.preview);
          setSelection(initialReviewSelection(created.preview.changes));
          requestAnimationFrame(()=>{reviewRegion.current?.scrollIntoView({block:'start'});reviewRegion.current?.focus({preventScroll:true});});
        }
      }
    } catch (error) {
      if (controller.current === task) {
        setMessage(error instanceof TailorError ? error.message : 'Could not tailor this resume. Your existing resumes are unchanged.');
        requestAnimationFrame(() => inputs.current?.scrollTo({ top: 0, behavior: 'instant' }));
      }
    } finally {
      if (controller.current === task) { controller.current = null; setBusy(false); setLatestUsage(readLatestTailorUsage()); }
    }
  };
  return <aside className={`tailor-pane ${result ? 'has-tailor-result' : ''} ${preview ? 'is-reviewing' : ''}`} aria-labelledby="tailor-heading" aria-busy={busy}>
    <header className="tailor-heading">
      <span className="tailor-mark" aria-hidden="true"><Sparkles size={20} /></span>
      <div><h2 id="tailor-heading">CV Tailor</h2><p>A focused resume for every role.</p></div>
    </header>
    <div ref={inputs} className="tailor-scroll" role="region" aria-label="CV tailoring inputs" tabIndex={0}>
      {message && <div className="tailor-feedback" role="alert"><Info size={17} aria-hidden="true" /><p>{message}</p></div>}
      <div className="tailor-source">
        <div className="tailor-source-heading"><label htmlFor="tailor-source">Source resume</label><button className="text-button" disabled={busy || !!preview} onClick={onImport}><Upload size={15} />Import CV</button></div>
        <div className="tailor-source-select"><FileText size={17} aria-hidden="true" /><select id="tailor-source" value={source?.profileId ?? ''} disabled={busy || !!preview} onChange={e => { setChoice({ activeId: e.target.value, sourceId: e.target.value }); setActiveProfile(e.target.value); setMessage(''); setReused(false); }}>
          {profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.profileName || 'Untitled resume'}</option>)}
        </select></div>
        <p>{result && source?.profileId !== activeId ? 'Uses the original, not the tailored copy you are editing.' : 'Your source stays unchanged. The result opens as a separate copy.'}</p>
        {source?.importedFrom && <button className="text-button import-source-review" disabled={busy || !!preview} onClick={() => onReviewImport(source.importedFrom!)}>Review imported content</button>}
        {!!source?.supportingEvidence?.length&&<details className="tailor-review" data-testid="supporting-evidence"><summary>Supporting evidence · {source.supportingEvidence.length}</summary><p>User-confirmed accounts, not independently verified. Used only as context on your next explicit Tailor CV request; not automatically printed on the PDF.</p>{source.supportingEvidence.map(e=><div className="tailor-change" key={e.id}><strong dir="auto">{e.title}</strong><p dir="auto">{e.task}</p><span>Tools or method</span><p dir="auto">{e.tools}</p><span>Observed outcome</span><p dir="auto">{e.outcome}</p></div>)}<button type="button" className="secondary-button" disabled={busy||!!preview} onClick={removeEvidence}>Make a copy without supporting evidence</button></details>}
        {defaultSource?.missingOriginal && choice?.activeId !== activeId && <p className="tailor-source-warning">The original is unavailable. The current resume will be used instead.</p>}
      </div>
      <div className="tailor-job">
        <div className="tailor-field-heading"><label htmlFor="tailor-job-description">Job description</label></div>
        <p id="tailor-job-help">Paste the responsibilities and requirements from the job listing.</p>
        <textarea id="tailor-job-description" dir="auto" value={draft} disabled={busy || !!preview} maxLength={JOB_LIMIT} onChange={e => updateDraft(e.target.value)} aria-describedby={`tailor-job-help tailor-draft-status${saveError ? ' tailor-draft-error' : ''}`} placeholder={'Paste a job description here…\n\nInclude the responsibilities and required skills for a more relevant result.'} />
        <div className="tailor-draft-meta"><span id="tailor-draft-status">{saveError ? 'Draft not saved' : draft ? <><Check size={13} aria-hidden="true" />Draft saved locally</> : 'Kept in this browser'}</span><span>{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span></div>
        {draft.trim().length > 0 && draft.trim().length < 60 && <p className="tailor-limit">Include more job details to tailor this resume (at least 60 characters).</p>}
        {draft.length >= JOB_LIMIT && <p className="tailor-limit" role="status">The draft limit is 24,000 characters. Keep the job details and remove unrelated listing text.</p>}
        {saveError && <p id="tailor-draft-error" className="tailor-draft-error" role="alert">Could not save this draft. Keep this tab open. Your resume is unaffected.</p>}
      </div>
      {preview && <section ref={reviewRegion} className="tailor-pending-review" aria-label="Review proposed changes" tabIndex={-1}>
        <TailorReviewPanel preview={preview} selection={selection} onChange={setSelection} onEditOriginal={editOriginal} onEvidenceSave={saveEvidence} onEvidenceOpenChange={setEvidenceOpen} />
      </section>}
      {!preview && result && <section className="tailor-result" aria-label="Tailoring result">
        <div className="tailor-result-title"><CheckCircle2 size={18} /><strong>{reused ? 'Saved copy reopened' : result.changes.length ? 'Tailored copy' : 'Reviewed copy'}</strong></div>
        <p>{result.jobTitle || 'Target role'}{result.company ? ` · ${result.company}` : ''}</p>
        <p className="tailor-result-note">{result.changes.some(c=>['summary','experience','projects'].includes(c.area)) ? 'Review the applied wording below, edit it in the usual editor, then export your PDF.' : result.changes.length ? 'Only skills organization or achievement order changed. No wording changes were applied. Review the job evidence and preserved suggestions below.' : 'No wording changes passed the checks. This separate copy keeps the source content; review the job evidence below.'}</p>
        {!!result.contentPlan?.length&&<ContentPlanView plan={result.contentPlan} saved/>}

        {result.review && <div className="tailor-review" data-testid="tailor-review-counts">
          <strong>What changed</strong>
          <p>AI wording applied: {result.review.appliedWording} of {result.review.proposedWording} proposed. Rejected by checks: {result.review.rejectedWording}.</p>
          <p>{result.review.skillsReordered ? 'Skills reordered. ' : 'Skill order preserved. '}{result.review.skillsGrouped ? 'Skill groups changed. ' : 'Skill groups preserved. '}Achievement orders changed: {result.review.achievementOrders}.</p>
          {result.review.reviewedAt && <p>User reviewed before saving. Other suggestions declined: {result.review.declinedChanges ?? 0}.{result.review.declinedGrouping ? ' Skill grouping declined separately.' : ''}</p>}
          {result.review.sourceBasedSummary && <p>Source-based summary alternative chosen separately; not counted as applied AI wording.</p>}
          <p>Generation snapshot, not a quality or ATS score. Later manual edits do not update these counts.</p>
        </div>}
        <JobAssessmentView assessment={result.jobAssessment}/>
        {!result.jobAssessment&&!!result.requirements?.length && <details className="tailor-review" data-testid="job-evidence"><summary>Job evidence · {result.requirements.length}</summary>
          <p>AI assessment, not verified suitability or an ATS score. Source references are checked locally, not the meaning of every claim. Gaps are not added to your CV.</p>
          <p>This is the generation snapshot; later edits do not update it.</p>
          {result.requirements.map((row,i)=><div className="tailor-change" key={i}>
            <strong>{row.status==='supported' ? 'Evidence cited' : row.status==='related' ? 'Related evidence' : 'No evidence cited'}</strong>
            <p dir="auto">{row.jobQuote}</p>
            {row.status==='not_found' ? <p>Not stated in the source resume. Tailoring uses the existing content and does not require extra answers.</p> : <details><summary>Source references · {row.evidence.length}</summary>{row.evidence.map(e=><div key={e.id}><span>{e.label}</span><p dir="auto">{e.text}</p></div>)}</details>}
          </div>)}
        </details>}
        {!!result.summaryEvidence?.length && <details className="tailor-review"><summary>Summary sources · {result.summaryEvidence.length}</summary><p>Source snapshots for the saved summary. References and conservative text checks are not a factual verification.</p>{result.summaryEvidence.map(e=><div className="tailor-change" key={e.id}><strong>{e.label}</strong><p dir="auto">{e.text}</p></div>)}</details>}
        {!!result.changes.length && <details className="tailor-review"><summary>View changes · {result.changes.length}</summary><p>These are the saved before/after changes. Locally prepared alternatives are labeled separately. Later manual edits are not overwritten.</p>{result.changes.map((change, i) => <div className="tailor-change" key={i}><strong>{change.area === 'bullet_order' ? 'Achievement order' : change.skillOperation === 'grouping' ? 'Skill grouping' : change.area === 'skills' ? 'Skill order' : change.area === 'summary' ? 'Professional summary' : change.area === 'projects' ? 'Project achievement' : 'Work achievement'}</strong><span>Before</span><p dir="auto">{change.before || '(Empty)'}</p><span>{change.origin==='source_based'?'Source-based alternative chosen':'Generated and accepted'}</span><p dir="auto">{change.after}</p><ChangePlanLinks change={change} plan={result.contentPlan??[]} /></div>)}</details>}
        {!!result.review?.rejected.length && <details className="tailor-review" data-testid="rejected-wording"><summary>Blocked AI wording · {result.review.rejected.length}</summary>
          <p>These proposals were NOT applied. Checks are conservative and can reject valid paraphrases; review them manually against the original. No extra AI request was made.</p>
          {result.review.rejected.map((item,i)=><div className="tailor-change" key={i}><strong>{item.reason}</strong><span>Source text before request</span><p dir="auto">{item.before || '(Empty)'}</p><span>Rejected proposal — not applied</span><p dir="auto">{item.proposed}</p></div>)}
        </details>}
        {!!result.warnings.length && <details className="tailor-review"><summary>Checks & preserved content</summary><ul>{result.warnings.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
        {!result.requirements?.length && !!result.missingRequirements.length && <details className="tailor-review"><summary>Requirements to check · {result.missingRequirements.length}</summary><p>AI notes, not verified facts. These were not added to your resume.</p><ul>{result.missingRequirements.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
      </section>}
      {connection.development && latestUsage && <details className="tailor-review tailor-usage"><summary>Development usage</summary>
        <p>Latest local attempt: {latestUsage.status}. {latestUsage.attempts} {latestUsage.attempts === 1 ? 'request' : 'requests'} · {(latestUsage.elapsedMs / 1000).toFixed(1)}s</p>
        <dl><div><dt>Input tokens</dt><dd>{latestUsage.input ?? 'Not reported'}</dd></div><div><dt>Output tokens</dt><dd>{latestUsage.output ?? 'Not reported'}</dd></div><div><dt>Thinking tokens</dt><dd>{latestUsage.thoughts ?? 'Not reported'}</dd></div><div><dt>Total tokens</dt><dd>{latestUsage.total ?? 'Not reported'}</dd></div></dl>
        <p>Success means the response was processed, not that a copy was saved or its quality verified. Provider-reported usage, not a cost estimate. Cancelled or failed requests may still use tokens. No resume or job text is stored in this log.</p>
      </details>}
    </div>
    <footer className="tailor-footer">
      <div className={`tailor-connection ${connection.ready ? 'is-ready' : ''}`} role="status"><span aria-hidden="true" />{busy ? 'Waiting for Gemini…' : connection.ready ? 'Gemini · local development' : connection.development ? 'AI setup pending' : 'Server connection required'}</div>
      {busy ? <div className="tailor-working"><span><Loader2 size={17} className="spin" />Tailoring your resume…</span><button className="text-button" onClick={() => controller.current?.abort()}><X size={16} />Cancel</button></div> : preview ? <div className="tailor-review-actions"><button type="button" className="primary-button" disabled={evidenceOpen||preview.clarificationOnly||preview.diagnosticOnly} onClick={confirm}>Save reviewed copy</button><button type="button" className="secondary-button" onClick={discard}>Discard review</button></div> : <button type="button" className="primary-button" disabled={!connection.ready || !source || draft.trim().length < 60} aria-describedby="tailor-availability" onClick={() => void generate()}><Sparkles size={17} />Tailor CV</button>}
      <p id="tailor-availability">{preview ? preview.clarificationOnly?'Local questions only. Save supporting accounts through the form; old AI wording is not reapplied.':evidenceOpen?'Finish or cancel the evidence form first. Saving answers sends no AI request.':'Saving sends no AI request. Unselected changes stay unchanged.' : connection.ready ? 'Sends professional fields, job text and any user-confirmed supporting accounts in the selected source, including recognized extra sections. Excludes contact fields, photos, private notes and import snapshot. One request; no automatic retries.' : connection.development ? 'The tailoring workflow is prepared. Gemini setup is deferred; nothing is sent while disconnected.' : 'Local resume editing and PDF export work. A secure server adapter is required to enable AI in production.'}</p>
    </footer>
  </aside>;
}
