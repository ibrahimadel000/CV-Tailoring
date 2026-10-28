import { useRef, useState } from 'react';
import { checkedEvidenceAnswers, evidenceQuestions, type EvidenceAnswer } from '@/services/evidenceEnrichment';
import type { TailoringPreview } from '@/services/tailorWorkflow';
export function EvidenceClarifier({preview,onSave,onOpenChange}:{preview:TailoringPreview;onSave:(answers:EvidenceAnswer[],confirmed:boolean)=>void;onOpenChange:(open:boolean)=>void}){
  const questions=evidenceQuestions(preview.requirements);
  const editor=useRef<HTMLElement>(null),errorMessage=useRef<HTMLParagraphElement>(null);
  const showError=(message:string)=>{setError(message);requestAnimationFrame(()=>errorMessage.current?.scrollIntoView({block:'center'}));};
  const [open,setOpen]=useState(false),[answers,setAnswers]=useState<Record<string,EvidenceAnswer>>({}),[review,setReview]=useState(false),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
  const answer=(id:string):EvidenceAnswer=>answers[id]??{questionId:id,decision:'skip',title:'',task:'',tools:'',outcome:''};
  const update=(id:string,patch:Partial<EvidenceAnswer>)=>{setAnswers(a=>({...a,[id]:{...answer(id),...patch}}));setError('');setConfirmed(false);};
  const values=()=>questions.map(q=>answer(q.id));
  const cancel=()=>{setOpen(false);setAnswers({});setReview(false);setConfirmed(false);setError('');onOpenChange(false);};
  const prepare=()=>{try{checkedEvidenceAnswers(questions,values());setReview(true);setConfirmed(false);setError('');requestAnimationFrame(()=>{editor.current?.scrollIntoView({block:'start'});editor.current?.focus({preventScroll:true});});}catch(e){showError(e instanceof Error?e.message:'Check the example fields.');}};
  const save=()=>{try{onSave(values(),confirmed);}catch(e){showError(e instanceof Error?e.message:'Could not save evidence. Existing resumes are unchanged.');}};
  if(!questions.length)return null;
  return <div className="tailor-review evidence-clarifier" data-testid="evidence-questions"><h4>Evidence to clarify</h4>
    <p>Which actual task or project supports the requirement? The questions below are prompts, not claims about you. No cited evidence does not prove you lack the experience.</p>
    {!open&&<>{questions.map(q=><div className="tailor-question" key={q.id}><strong dir="auto">{q.requirement}</strong><p dir="auto">{q.jobQuote}</p><ul>{q.prompts.map((p,i)=><li key={i}>{p}</li>)}</ul></div>)}<button type="button" className="secondary-button" onClick={()=>{setOpen(true);onOpenChange(true);}}>Add real examples locally</button></>}
    {open&&<section ref={editor} tabIndex={-1} className="evidence-editor" aria-label="Clarify supporting experience" data-testid="evidence-editor">
      <p className="tailor-pending-status">No AI request is sent while answering, reviewing or saving. The original stays unchanged.</p>
      <p>Only add your own real work. Do not paste keys, contact details, confidential client data or invented numbers. A qualitative outcome is fine. Answers stay in memory until you explicitly save.</p>
      {error&&<p ref={errorMessage} role="alert" className="tailor-pending-status">{error}</p>}
      {!review?<>{questions.map(q=>{const a=answer(q.id);return <fieldset className="tailor-summary-options" key={q.id}><legend dir="auto">{q.requirement}</legend><ul>{q.prompts.map((p,i)=><li key={i}>{p}</li>)}</ul>
        <label className="tailor-choice"><input type="radio" name={`evidence-${q.id}`} checked={a.decision==='skip'} onChange={()=>update(q.id,{decision:'skip'})}/><span>No example to add — leave this gap unchanged</span></label>
        <label className="tailor-choice"><input type="radio" name={`evidence-${q.id}`} checked={a.decision==='example'} onChange={()=>update(q.id,{decision:'example'})}/><span>Add an actual example for this requirement</span></label>
        {a.decision==='example'&&<div className="evidence-fields">
          <label>Example title<input aria-label="Example title" value={a.title} maxLength={100} onChange={e=>update(q.id,{title:e.target.value})} dir="auto"/></label>
          <label>Your task and contribution<textarea aria-label="Your task and contribution" value={a.task} maxLength={700} onChange={e=>update(q.id,{task:e.target.value})} dir="auto" placeholder="Describe what you actually did, not just that you know a tool."/></label>
          <label>Tools or method actually used<input aria-label="Tools or method actually used" value={a.tools} maxLength={240} onChange={e=>update(q.id,{tools:e.target.value})} dir="auto"/></label>
          <label>Observed outcome<textarea aria-label="Observed outcome" value={a.outcome} maxLength={400} onChange={e=>update(q.id,{outcome:e.target.value})} dir="auto" placeholder="What happened or what did you verify? No invented percentage is needed."/></label>
        </div>}
      </fieldset>;})}<button type="button" className="secondary-button" onClick={prepare}>Review answers locally</button></>:<div data-testid="evidence-answer-review"><h4>Review your accounts before saving</h4>
        {values().filter(a=>a.decision==='example').map(a=><div className="tailor-change" key={a.questionId}><strong>{a.title}</strong><span>Your task</span><p dir="auto">{a.task}</p><span>Tools or method</span><p dir="auto">{a.tools}</p><span>Observed outcome</span><p dir="auto">{a.outcome}</p></div>)}
        <p>Saving creates a separate evidence source copy and discards the current AI proposals. Your CV body and original are not edited. These accounts are supporting context, not printed on the PDF automatically. They are sent to Gemini only when you later press Tailor CV on that source.</p>
        <label className="tailor-choice"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I reviewed these accounts and confirm they describe my real work. This is my statement, not independent verification.</span></label>
        <button type="button" className="primary-button" disabled={!confirmed} onClick={save}>Save evidence source copy — no AI request</button>
        <button type="button" className="secondary-button" onClick={()=>{setReview(false);setConfirmed(false);setError('');}}>Back to answers</button>
      </div>}
      <button type="button" className="text-button" onClick={cancel}>Cancel answers and keep this review</button>
    </section>}
  </div>;
}
