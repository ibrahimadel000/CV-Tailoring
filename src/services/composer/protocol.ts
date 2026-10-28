import { z } from 'zod';
import { formatIssues, newDiagnostics, omittedRow } from '@/services/composer/diagnostics';
import type { CVProfile } from '@/types/schema';
import { applyTo } from '@/vendor/reactive-resume/proposals';
import { decodeTailorResponse } from '@/services/tailorProtocol';
import { compositionIssue, evidenceCatalog, TailorError } from '@/services/tailorModel';
import type { buildFactBank } from '@/services/composer/factBank';
import type { JobPassage } from '@/services/composer/job';
const text=z.string().trim(),ref=text.min(1).max(120);
const schema=z.object({jobTitle:text.max(160),company:text.max(160),
 summary:z.array(z.unknown()).max(4),edits:z.array(z.unknown()).max(32),
 requirements:z.array(z.unknown()).max(60),skillOrder:z.array(z.unknown()).max(150),
 skillGroups:z.array(z.unknown()).max(4).default([]),
 bulletOrder:z.array(z.unknown()).max(12).default([]),
}).strict();
const sentence=z.object({text:text.min(1).max(700),evidenceIds:z.array(ref).min(1).max(16)}).strict();
const edit=z.object({target:ref,before:text.max(1800),after:text.min(1).max(900),why:text.min(3).max(240),requirementId:text.max(120)}).strict();
const assessment=z.object({id:ref,status:z.enum(['supported','related','not_found']),evidenceIds:z.array(ref).max(4)}).strict();
const order=z.object({entryId:ref,bulletIds:z.array(ref).min(1).max(32),requirementId:text.max(120)}).strict();
export const composerOutputSchema={type:'OBJECT',properties:{
 jobTitle:{type:'STRING'},company:{type:'STRING'},
 summary:{type:'ARRAY',items:{type:'OBJECT',properties:{text:{type:'STRING'},evidenceIds:{type:'ARRAY',items:{type:'STRING'}}},required:['text','evidenceIds']}},
 edits:{type:'ARRAY',items:{type:'OBJECT',properties:{target:{type:'STRING'},before:{type:'STRING'},after:{type:'STRING'},why:{type:'STRING'},requirementId:{type:'STRING'}},required:['target','before','after','why','requirementId']}},
 requirements:{type:'ARRAY',items:{type:'OBJECT',properties:{id:{type:'STRING'},status:{type:'STRING',enum:['supported','related','not_found']},evidenceIds:{type:'ARRAY',items:{type:'STRING'}}},required:['id','status','evidenceIds']}},
 skillOrder:{type:'ARRAY',items:{type:'STRING'}},
 skillGroups:{type:'ARRAY',items:{type:'OBJECT',properties:{category:{type:'STRING',enum:['Technical','Soft','Tools','Languages']},skillIds:{type:'ARRAY',items:{type:'STRING'}}},required:['category','skillIds']}},
 bulletOrder:{type:'ARRAY',items:{type:'OBJECT',properties:{entryId:{type:'STRING'},bulletIds:{type:'ARRAY',items:{type:'STRING'}},requirementId:{type:'STRING'}},required:['entryId','bulletIds','requirementId']}},
},required:['jobTitle','company','summary','edits','requirements','skillOrder','skillGroups','bulletOrder']};
export type ComposerReason={bulletId:string;why:string;jobQuote:string};
export function decodeComposition(raw:unknown,facts:ReturnType<typeof buildFactBank>,jobs:JobPassage[],source:CVProfile){
 const parsed=schema.safeParse(raw);if(!parsed.success)throw new TailorError('invalid','The composition response had an invalid envelope. '+formatIssues(parsed.error).join('; ')+'. No resume was changed. No automatic retry was made.');
 const value=parsed.data,warnings:string[]=jobs.length?[]:['No short requirement passages could be extracted. Read the full job description; no coverage or suitability is established.'],blocked:{area:'summary'|'experience'|'projects';before:string;proposed:string;reason:string}[]=[],reasons:ComposerReason[]=[];
 const diagnostics=newDiagnostics(value);
 const byJob=new Map(jobs.map(j=>[j.id,j])),byPassage=new Map(facts.passages.map(p=>[p.id,p])),catalog=evidenceCatalog(source);
 const canonical=(refs:string[])=>refs.map(id=>facts.references.get(id)?.id??'');
 const summaries:{text:string;evidenceIds:string[]}[]=[];
 for(const [index,row] of value.summary.entries()){const p=sentence.safeParse(row);if(!p.success){const issues=formatIssues(p.error);diagnostics.omitted.push(omittedRow('summary',index,row,issues));warnings.push(`summary[${index+1}] omitted: ${issues.join('; ')}. Other valid rows remain available.`);continue;}
  const s=p.data,ids=canonical(s.evidenceIds);
  const reason=new Set(ids).size!==ids.length||ids.some(id=>!catalog.has(id))?'Summary sentence had missing, repeated or unknown source references.':compositionIssue(source.summary.data,s.text,ids.map(id=>catalog.get(id)!),true);
  if(reason){diagnostics.omitted.push(omittedRow('summary',index,row,[reason]));blocked.push({area:'summary',before:source.summary.data,proposed:s.text,reason});continue;}
  if([...summaries.map(v=>v.text),s.text].join(' ').length>1800||new Set([...summaries.flatMap(v=>v.evidenceIds),...s.evidenceIds]).size>32){diagnostics.omitted.push(omittedRow('summary',index,row,['Combined summary text or source count exceeded the allowed budget.']));blocked.push({area:'summary',before:source.summary.data,proposed:s.text,reason:'This entire sentence exceeded the combined summary budget. No sentence or source list was truncated.'});continue;}summaries.push(s);diagnostics.forwarded.summary++;
 }
 const bullets:{section:'experience'|'projects';entryId:string;bulletId:string;text:string;jobQuote:string}[]=[];
 const seen=new Set<string>();
 for(const [index,row] of value.edits.entries()){const p=edit.safeParse(row);if(!p.success){const issues=formatIssues(p.error);diagnostics.omitted.push(omittedRow('edits',index,row,issues));warnings.push(`edits[${index+1}] omitted: ${issues.join('; ')}. Other valid rows remain available.`);continue;}
  const e=p.data,target=byPassage.get(e.target),binding=facts.references.get(e.target);
  const targetIssue=!target?'Unknown target reference.':!target.editable?'Target is locked or not editable.':!binding?.parent||!['work_achievement','project_achievement'].includes(target.kind)?'Target is not a work/project achievement.':seen.has(e.target)?'Repeated target reference.':e.requirementId&&!byJob.has(e.requirementId)?'Unknown requirementId reference.':undefined;
  if(targetIssue||!target||!binding?.parent){diagnostics.omitted.push(omittedRow('edits',index,row,[targetIssue??'Unavailable source binding.']));warnings.push(`edits[${index+1}] omitted: ${targetIssue?.toLowerCase()}`);continue;}
  seen.add(e.target);
  // Reused upstream stale/ambiguous-passage guard, plus full-field equality:
  // a substring match cannot authorize a partial or unrelated achievement.
  const after=e.before===target.text?applyTo(target.text,{before:e.before,after:e.after}):undefined;
  const section=target.kind==='work_achievement'?'experience':'projects';
  if(after===undefined){diagnostics.omitted.push(omittedRow('edits',index,row,['before does not match the entire original passage.']));blocked.push({area:section,before:target.text,proposed:e.after,reason:'The proposal did not match the entire original passage. No text was guessed.'});continue;}
  diagnostics.forwarded.edits++;bullets.push({section,entryId:binding.parent,bulletId:e.target,text:after,jobQuote:''});
  reasons.push({bulletId:binding.id,why:e.why,jobQuote:byJob.get(e.requirementId)?.text??''});
 }
 const requirements: {requirement:string;jobQuote:string;status:'supported'|'related'|'not_found';evidenceIds:string[]}[]=[];const seenJobs=new Set<string>();
 for(const [index,row] of value.requirements.entries()){const p=assessment.safeParse(row);if(!p.success){const issues=formatIssues(p.error);diagnostics.omitted.push(omittedRow('requirements',index,row,issues));warnings.push(`requirements[${index+1}] omitted: ${issues.join('; ')}. Other valid rows remain available.`);continue;}
  const r=p.data,j=byJob.get(r.id);if(!j||seenJobs.has(r.id)){diagnostics.omitted.push(omittedRow('requirements',index,row,['Unknown or repeated job passage.']));warnings.push('An assessment referenced an unknown or repeated job passage.');continue;}seenJobs.add(r.id);
  diagnostics.forwarded.requirements++;requirements.push({requirement:j.text.slice(0,180),jobQuote:j.text,status:r.status,evidenceIds:r.evidenceIds});
 }
 const bulletOrder=[];
 for(const [index,row] of value.bulletOrder.entries()){const p=order.safeParse(row);if(!p.success){const issues=formatIssues(p.error);diagnostics.omitted.push(omittedRow('bulletOrder',index,row,issues));warnings.push(`bulletOrder[${index+1}] omitted: ${issues.join('; ')}. Other valid rows remain available.`);continue;}const o=p.data,b=facts.references.get(o.entryId);if(!b||!['work_role','project'].includes(b.kind)||!byJob.has(o.requirementId)){diagnostics.omitted.push(omittedRow('bulletOrder',index,row,['Unknown entry or requirement.']));warnings.push('An achievement order had an unknown entry or requirement.');continue;}
  // Canonical engine requires a related assessment link for ordering only.
  diagnostics.forwarded.bulletOrder++;bulletOrder.push({section:b.kind==='work_role'?'experience' as const:'projects' as const,entryId:o.entryId,bulletIds:o.bulletIds,jobQuote:byJob.get(o.requirementId)!.text});
 }
 const skills=z.array(ref).max(150).safeParse(value.skillOrder);
 const groups=z.array(z.object({category:z.enum(['Technical','Soft','Tools','Languages']),skillIds:z.array(ref).min(1).max(150)}).strict()).max(4).safeParse(value.skillGroups);
 if(!skills.success){diagnostics.omitted.push(omittedRow('skillOrder',0,{},formatIssues(skills.error)));warnings.push('Skill order omitted: '+formatIssues(skills.error).join('; '));}else diagnostics.forwarded.skillOrder=skills.data.length;
 if(!groups.success){diagnostics.omitted.push(omittedRow('skillGroups',0,{},formatIssues(groups.error)));warnings.push('Skill grouping omitted: '+formatIssues(groups.error).join('; '));}else diagnostics.forwarded.skillGroups=groups.data.length;
 const decoded=decodeTailorResponse({jobTitle:value.jobTitle,company:value.company,summary:summaries.map(s=>s.text).join(' '),summaryEvidenceIds:[...new Set(summaries.flatMap(s=>s.evidenceIds))],bullets,skillOrder:skills.success?skills.data:[],skillGroups:groups.success?groups.data:[],bulletOrder,requirements,contentPlan:[],missingRequirements:[]},facts.references);
 return {...decoded,diagnostics,warnings:[...warnings,...decoded.warnings],blocked,reasons};
}
