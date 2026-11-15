import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { cvProfileSchema, supportingEvidenceSchema, type CVProfile, type SupportingEvidence } from '@/types/schema';
import { TailorError, type applyTailorPatch } from '@/services/tailorModel';
type Assessment=ReturnType<typeof applyTailorPatch>['requirements'][number];
export type EvidenceQuestion={id:string;requirement:string;jobQuote:string;prompts:string[]};
export type EvidenceAnswer={questionId:string;decision:'example'|'skip';title:string;task:string;tools:string;outcome:string};
export function evidenceQuestions(requirements:Assessment[]):EvidenceQuestion[]{
  return requirements.filter(r=>r.status!=='supported').map((r,i)=>{
    const text=(r.requirement+' '+r.jobQuote).toLowerCase(),prompts:string[]=[];
    if(/python|بايثون/.test(text))prompts.push('What did your Python code actually do? Describe the input, processing and output; name scientific libraries only if you used them.');
    if(/coding agents?|copilot|cursor|مساعد.*برمج/.test(text))prompts.push('Which coding assistant or agent did you use, for what development task, and how did you check its output? Calling an LLM API alone does not establish coding-agent use.');
    if(/validat|evaluat|review|troubleshoot|assumptions?|constraints?|edge cases?|sources? of error|تحقق|اختبار|تصحيح/.test(text))prompts.push('Describe a concrete error, assumption or edge case you checked. What test or comparison did you perform, and what did you observe?');
    if(/scientific|quantitative|mathemat|physics|chemistry|biology|robotic|stem|algorithm|علمي|خوارزم/.test(text))prompts.push('Which specific technical or scientific problem did you solve in your own domain? Explain your method and how you assessed the result; do not claim every STEM discipline.');
    if(/\b(?:communicat\w*|explain\w*|teach\w*|train(?:ing|ed|s)?)\b|تدريب|شرح/.test(text))prompts.push('Who was the audience, what technical concept did you explain, and what did you do to check their understanding?');
    if(!prompts.length)prompts.push('What real task demonstrates this requirement, what was your own contribution, and what was the outcome?');
    return{id:`question_${i+1}`,requirement:r.requirement,jobQuote:r.jobQuote,prompts};
  });
}
const answerSchema=z.object({questionId:z.string().min(1).max(40),decision:z.enum(['example','skip']),title:z.string().max(100),task:z.string().max(700),tools:z.string().max(240),outcome:z.string().max(400)}).strict();
function safeProfessionalText(text:string){
  if(/AIza[A-Za-z0-9_-]{20,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text))throw new TailorError('input','Remove credentials or email/contact details from supporting evidence. Keep only professional task details.');
}
export function checkedEvidenceAnswers(questions:EvidenceQuestion[],raw:unknown):Omit<SupportingEvidence,'id'|'confirmedAt'|'provenance'>[]{
  const parsed=z.array(answerSchema).max(6).safeParse(raw);
  if(!parsed.success)throw new TailorError('input','Check the answer fields and length limits. Nothing was saved or sent.');
  const byId=new Map(questions.map(q=>[q.id,q])),seen=new Set<string>(),content=new Set<string>();
  const notes:Omit<SupportingEvidence,'id'|'confirmedAt'|'provenance'>[]=[];
  for(const answer of parsed.data){
    const question=byId.get(answer.questionId);
    if(!question||seen.has(answer.questionId))throw new TailorError('input','An answer has an unknown or repeated question. Nothing was saved.');
    seen.add(answer.questionId);if(answer.decision==='skip')continue;
    const note={requirement:question.requirement,title:answer.title.trim(),task:answer.task.trim(),tools:answer.tools.trim(),outcome:answer.outcome.trim()};
    if(note.title.length<3||note.task.length<30||note.tools.length<2||note.outcome.length<10)throw new TailorError('input','For each example, give a title (3+ characters), your actual task (30+), tools or method (2+), and observed outcome (10+). Do not invent a metric; a qualitative outcome is fine.');
    safeProfessionalText([note.title,note.task,note.tools,note.outcome].join(' '));
    const key=JSON.stringify([note.title,note.task,note.tools,note.outcome]).toLocaleLowerCase();
    if(content.has(key))throw new TailorError('input','Use an identical example once, not as multiple independent pieces of evidence.');
    content.add(key);notes.push(note);
  }
  if(!notes.length)throw new TailorError('input','No example was added. Leave the gap unchanged or return to the review; no copy or AI request is needed.');
  return notes;
}
export function evidenceSourceCopy(source:CVProfile,questions:EvidenceQuestion[],answers:unknown,confirmed:boolean):CVProfile{
  if(confirmed!==true)throw new TailorError('input','Review and confirm your own account before saving. This is not independent verification.');
  const notes=checkedEvidenceAnswers(questions,answers),now=new Date().toISOString();
  const previous=source.supportingEvidence??[];
  const additions=notes.map(n=>({...n,id:uuid(),confirmedAt:now,provenance:'user_confirmed_not_verified' as const}));
  const all=supportingEvidenceSchema.safeParse([...previous,...additions]);
  if(!all.success)throw new TailorError('input','Supporting evidence is limited to 12 accounts. Make a copy without old supporting evidence before adding more.');
  const keys=new Set<string>();for(const n of all.data){const k=JSON.stringify([n.title,n.task,n.tools,n.outcome]).toLocaleLowerCase();if(keys.has(k))throw new TailorError('input','This example is already present. Do not save it as new evidence again.');keys.add(k);}
  const copy=independentSourceCopy(source,'Evidence source');copy.supportingEvidence=all.data;
  if(!cvProfileSchema.safeParse(copy).success)throw new TailorError('invalid','The evidence source could not be validated. Nothing was saved.');
  return copy;
}
export function independentSourceCopy(source:CVProfile,suffix:string):CVProfile{
  const copy:CVProfile=JSON.parse(JSON.stringify(source));delete copy.compositionSnapshot;delete copy.compositionSnapshotStatus;delete copy.compositionChanges;copy.profileId=uuid();copy.baseProfileId=source.profileId;
  copy.profileName=`${source.profileName.slice(0,Math.max(1,97-suffix.length))} — ${suffix}`;copy.version=source.version+1;copy.lastConfirmed='';
  delete copy.tailoring;delete copy.targetJob;delete copy.matchScore;return copy;
}
