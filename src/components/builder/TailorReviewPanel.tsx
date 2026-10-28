import { TailorDiagnostics } from './TailorDiagnostics';
import { JobAssessmentView } from './JobAssessmentView';
import { selectedDocumentRows } from '@/services/composer/review';
import { ContentPlanView, ChangePlanLinks } from './TailorContentPlan';
import { EvidenceClarifier } from './EvidenceClarifier';
import type { EvidenceAnswer } from '@/services/evidenceEnrichment';
import type { TailoringPreview, ReviewSelection } from '@/services/tailorWorkflow';
const title=(area:string)=>area==='skills'?'Skill order':area==='skill_groups'?'Skill grouping':area==='bullet_order'?'Achievement order':area==='projects'?'Project achievement':'Work achievement';
export function TailorReviewPanel({preview,selection,onChange,onEvidenceSave,onEvidenceOpenChange}:{preview:TailoringPreview;selection:ReviewSelection;onChange:(value:ReviewSelection)=>void;onEditOriginal:()=>void;onEvidenceSave:(answers:EvidenceAnswer[],confirmed:boolean)=>void;onEvidenceOpenChange:(open:boolean)=>void}) {
  const summary=preview.changes.find(c=>c.area==='summary');
  const toggle=(index:number)=>onChange({...selection,selectedChanges:selection.selectedChanges.includes(index)?selection.selectedChanges.filter(i=>i!==index):[...selection.selectedChanges,index]});
  if(preview.clarificationOnly)return <><h3>Clarify a saved assessment</h3><p className="tailor-pending-status">No AI request was made. These questions come from the saved job assessment, not a fresh analysis. Your current source and all existing copies are unchanged.</p><EvidenceClarifier preview={preview} onSave={onEvidenceSave} onOpenChange={onEvidenceOpenChange}/><p>Only supporting accounts can be saved here; old AI wording will not be reapplied.</p></>;
  return <>
    <h3>Review before saving</h3>
    <p className="tailor-pending-status" role="status">Not saved yet. Your original and existing copies are unchanged.</p>
    {preview.diagnosticOnly&&<p role="status">No usable changes or assessment were returned. This review is for diagnostics only; saving is disabled. Your original is unchanged.</p>}
    <p>Target: {preview.jobTitle||'Job description'}. Choose the changes to include, then save a separate copy. Your resume is the source. Suggestions are selected as a complete draft; you can change any choice before saving.</p>
    {preview.warnings.filter(w=>w.startsWith('Skill order omitted:')||w.startsWith('Content plan item(s) omitted:')).map((w,i)=><p className="tailor-pending-status" role="status" key={i}>{w}</p>)}
    <details open className="tailor-review" data-testid="composition-preview"><summary>Tailored draft — review before saving</summary><p>Professional text preview, updated with your choices. Contact details are not shown here. Existing extra sections are preserved. The main page preview stays on the original until you save a separate copy. Identity, dates and design are unchanged.</p>{selectedDocumentRows(preview.document??[],selection.selectedChanges).map((row,i)=>{const change=row.changeIndex===undefined?undefined:preview.changes[row.changeIndex];const text=row.summary?(selection.summary==='generated'?summary?.after:selection.summary==='source_based'?preview.alternative?.text:preview.originalSummary):change&&selection.selectedChanges.includes(row.changeIndex!)?change.after:row.text;return <div className="tailor-change" key={i}><strong>{row.label}</strong><p dir="auto" style={{whiteSpace:'pre-wrap'}}>{text||'(Empty)'}</p></div>;})}</details>
    {!!preview.contentPlan?.length&&<details className="tailor-review"><summary>Why these changes</summary><ContentPlanView plan={preview.contentPlan}/></details>}
    <fieldset className="tailor-summary-options"><legend>Summary choice</legend>
      <label className="tailor-choice"><input type="radio" name="tailor-summary-choice" value="original" checked={selection.summary==='original'} onChange={()=>onChange({...selection,summary:'original'})} /><span>Keep original summary</span></label>
      <p className="tailor-review-text" dir="auto">{preview.originalSummary||'(Empty)'}</p>
      {summary && <><label className="tailor-choice"><input type="radio" name="tailor-summary-choice" value="generated" checked={selection.summary==='generated'} onChange={()=>onChange({...selection,summary:'generated'})} /><span>Use proposed summary</span></label><p className="tailor-review-text" dir="auto">{summary.after}</p><ChangePlanLinks change={summary} plan={preview.contentPlan??[]} /></>}
      {preview.alternative && <><label className="tailor-choice"><input type="radio" name="tailor-summary-choice" value="source_based" checked={selection.summary==='source_based'} onChange={()=>onChange({...selection,summary:'source_based'})} /><span>Use source-based alternative</span></label><p className="tailor-review-text" dir="auto">{preview.alternative.text}</p><p>{preview.alternative.explanation}</p><details className="tailor-review"><summary>Alternative source snapshots · {preview.alternative.evidence.length}</summary>{preview.alternative.evidence.map(e=><div className="tailor-change" key={e.id}><strong>{e.label}</strong><p dir="auto">{e.text}</p></div>)}</details></>}
      {!summary&&!preview.alternative && <p>No eligible replacement is available. The original summary will stay unless you edit it yourself.</p>}
    </fieldset>
    <div className="tailor-review" data-testid="pending-change-choices"><h4>Other proposed changes</h4><p>Only selected suggestions will be included. Rejecting an order does not remove content.</p>
      {preview.changes.map((change,i)=>change.area==='summary'?null:<div className="tailor-change" key={i}>
        <label className="tailor-choice"><input type="checkbox" checked={selection.selectedChanges.includes(i)} onChange={()=>toggle(i)} aria-label={`Apply ${change.textField==='description'?'role overview':title(change.area).toLowerCase()} ${i+1}`} /><strong>{change.textField==='description'?'Role overview':title(change.area)}</strong></label>
        <span>Before</span><p dir="auto">{change.before||'(Empty)'}</p><span>Proposed — not saved</span><p dir="auto">{change.after}</p><ChangePlanLinks change={change} plan={preview.contentPlan??[]} />
      </div>)}
      {!preview.changes.some(c=>c.area!=='summary')&&<p>No other eligible changes were proposed.</p>}
    </div>
    {!!preview.rejected.length && <details className="tailor-review" data-testid="pending-rejected"><summary>Blocked proposals · {preview.rejected.length}</summary><p>These cannot be selected here. Add real evidence to the original or edit your own wording manually; do not treat a cited ID as proof of every claim.</p>{preview.rejected.map((r,i)=><div className="tailor-change" key={i}><strong>{r.reason}</strong><span>Rejected — not applied</span><p dir="auto">{r.proposed}</p></div>)}</details>}
    <TailorDiagnostics diagnostics={preview.diagnostics}/>
    <JobAssessmentView assessment={preview.jobAssessment}/>
    {!preview.jobAssessment&&!!preview.requirements.length && <details className="tailor-review" data-testid="pending-evidence"><summary>Job evidence · {preview.requirements.length}</summary><p>AI assessment, not a suitability or ATS score. Direct, partial and missing evidence refer only to the submitted source.</p>{preview.requirements.map((r,i)=><div className="tailor-change" key={i}><strong>{r.status==='supported'?'Evidence cited':r.status==='related'?'Related evidence':'No evidence cited'}</strong><p dir="auto">{r.jobQuote}</p>{!!r.evidence.length&&<details><summary>Source references · {r.evidence.length}</summary>{r.evidence.map(e=><div key={e.id}><span>{e.label}</span><p dir="auto">{e.text}</p></div>)}</details>}</div>)}</details>}

    {!!preview.warnings.length&&<details className="tailor-review"><summary>Checks and limitations</summary><ul>{preview.warnings.map((v,i)=><li key={i}>{v}</li>)}</ul></details>}
    <p className="tailor-review-reminder">This review is held in memory only. Reloading or leaving the workspace discards it. Saving creates a new CV; it never updates the original.</p>
  </>;
}
