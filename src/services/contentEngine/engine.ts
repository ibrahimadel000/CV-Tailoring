import { formatDateRange } from '@/components/builder/resumeModel';
import {z} from 'zod';
import type {CVProfile} from '@/types/schema';
import {originalSkillContext} from './skillContext';
import {professionalContext} from '@/services/tailorModel';
const ref=z.string().min(1).max(100),text=z.string().trim().max(2400);
const evidence=z.object({id:ref,kind:z.enum(['headline','summary','skill','role','achievement','project','education','certification','context']),parent:z.string().max(100),profileCategory:z.enum(['Technical','Soft','Tools','Languages']).optional(),text:z.string().min(1).max(12000)}).strict();
const entry=z.object({id:ref,title:text,organization:text,dates:text,overviewId:z.string().max(100),bulletIds:z.array(ref).max(80)}).strict();
export const sourceSchema=z.object({version:z.literal('content-r1'),headline:text,summaryId:z.string().max(100),locks:z.object({summary:z.boolean(),experience:z.boolean(),projects:z.boolean(),skills:z.boolean()}).strict(),experience:z.array(entry).max(30),projects:z.array(entry).max(30),skillIds:z.array(ref).max(200),skillContextOrigin:z.enum(['original_import','profile_only']).optional(),originalSkillContexts:z.array(z.object({sectionTitle:z.string().max(120),groupTitle:z.string().max(120),skillIds:z.array(ref).min(1).max(200)}).strict()).max(200).optional(),skillGroups:z.array(z.object({sectionTitle:z.string().max(120),groupTitle:z.string().max(120),skillIds:z.array(ref).min(1).max(200)}).strict()).max(200).optional(),evidence:z.array(evidence).max(500)}).strict();
export type Source=z.infer<typeof sourceSchema>;
/** Shared structural source guard, derived from the working composer guard.
 * It validates identity/ownership, not semantic entailment or model quality.
 * Source field shapes and persistence schema are unchanged.
 */
export function parseSourceGraph(input: unknown): Source {
 const source=sourceSchema.parse(input),facts=new Map(source.evidence.map(f=>[f.id,f]));
 const fail=()=>{throw Error('Professional source has inconsistent identities or passage relationships. Nothing was sent or saved.');};
 if(facts.size!==source.evidence.length)fail();
 const entries=[...source.experience,...source.projects];
 if(new Set(entries.map(e=>e.id)).size!==entries.length||new Set(source.skillIds).size!==source.skillIds.length||entries.some(e=>facts.has(e.id)))fail();
 if(source.summaryId&&(facts.get(source.summaryId)?.kind!=='summary'||facts.get(source.summaryId)?.parent))fail();
 for(const id of source.skillIds)if(facts.get(id)?.kind!=='skill'||facts.get(id)?.parent)fail();
 for(const e of entries){
  const ids=[e.overviewId,...e.bulletIds].filter(Boolean);
  if(new Set(ids).size!==ids.length)fail();
  for(const id of ids)if(!facts.has(id)||facts.get(id)!.parent!==e.id||!['role','achievement','project'].includes(facts.get(id)!.kind))fail();
 }
 // A recovered/display group cannot introduce unknown, narrative or repeated IDs.
 // Different rows may legitimately reference the same skill in different contexts.
 for(const group of [...source.originalSkillContexts??[],...source.skillGroups??[]]){
  if(new Set(group.skillIds).size!==group.skillIds.length||group.skillIds.some(id=>!source.skillIds.includes(id)))fail();
 }
 for(const fact of source.evidence){
  if(fact.parent&&!entries.some(e=>e.id===fact.parent))fail();
  if(['role','achievement','project'].includes(fact.kind)){
   const owner=entries.find(e=>e.id===fact.parent);
   if(!owner||![owner.overviewId,...owner.bulletIds].includes(fact.id))fail();
  }else if(fact.parent&&!(fact.kind==='context'&&fact.id.startsWith('entrymeta:')))fail();
 }
 // Reserved entrymeta context facts are derived/checked by withEntryMetadata in
 // the composer. General professional context with an empty parent stays valid.
 return source;
}
export function projectSource(p:CVProfile):Source{
 const facts:Source['evidence']=[],add=(id:string,kind:Source['evidence'][number]['kind'],value:string,parent='')=>{if(value.trim())facts.push({id,kind,parent,text:value.trim()});return value.trim()?id:'';};
 add('headline','headline',p.resumeHeader.data.desiredJobPosition||p.headline.data);
 const summaryId=add('summary','summary',p.summary.data);
 const experience=p.experience.data.map((e,i)=>{const id=`work_${i+1}`,overviewId=add(id+'_overview','role',e.description||'',id);return{id,title:e.roleTitle,organization:e.companyName,dates:formatDateRange(e.startDate, e.endDate),overviewId,bulletIds:e.bullets.map((b,j)=>add(id+'_b'+(j+1),'achievement',b.text,id)).filter(Boolean)};});
 const projects=p.projects.data.map((e,i)=>{const id=`project_${i+1}`;return{id,title:e.name,organization:e.role||'',dates:'',overviewId:'',bulletIds:e.bullets.map((b,j)=>add(id+'_b'+(j+1),'achievement',b.text,id)).filter(Boolean)};});
 const skillIds=p.skills.data.map((s,i)=>add('skill_'+(i+1),'skill',[s.name,s.level].filter(Boolean).join(' — '))).filter(Boolean);
 // Profile categories are importer/editor classifications, NOT original source headings.
 for(const [i,s] of p.skills.data.entries()){const f=facts.find(f=>f.id==='skill_'+(i+1));if(f)f.profileCategory=s.category;}
 // Native categories describe the editor's groups, not recovered PDF headings.
 const skillGroups=['Technical','Tools','Soft','Languages'].map(category=>({sectionTitle:'Editor category',groupTitle:category,skillIds:p.skills.data.flatMap((s,i)=>s.category===category&&skillIds.includes('skill_'+(i+1))?['skill_'+(i+1)]:[])})).filter(g=>g.skillIds.length);

 for(const [i,e] of p.education.data.entries())add('education_'+(i+1),'education',[e.degree,e.institution,e.startDate,e.graduationDate||e.endDate,e.gpa,e.description,...e.honors??[]].filter(Boolean).join(' · '));
 for(const [i,c] of p.certifications.data.entries())add('cert_'+(i+1),'certification',[c.name,c.issuer,c.date].filter(Boolean).join(' · '));
 for(const [i,c] of professionalContext(p).entries())add('context_'+(i+1),'context',c.section+' · '+c.text);
 const originalSkillContexts=originalSkillContext(p);
 const out=parseSourceGraph({version:'content-r1',headline:p.resumeHeader.data.desiredJobPosition||p.headline.data,summaryId,locks:{summary:p.summary.isLocked,experience:p.experience.isLocked,projects:p.projects.isLocked,skills:p.skills.isLocked},experience,projects,skillIds,skillContextOrigin:originalSkillContexts.length?'original_import':'profile_only',originalSkillContexts,skillGroups,evidence:facts});
 if(JSON.stringify(out).length>120000)throw Error('Professional source exceeds the 120,000-character limit. Nothing was sent.');
 return out;
}
export const inputSchema=z.object({source:sourceSchema,job:z.string().trim().min(40).max(32000)}).strict();
const passage=z.object({text:text,sourceIds:z.array(ref).max(24)}).strict();
const omission=z.object({sourceId:ref,reason:z.string().trim().min(3).max(400)}).strict();
const draftEntry=z.object({id:ref,overview:passage,bullets:z.array(passage).max(40),omitted:z.array(omission).max(80)}).strict();
export const draftSchema=z.object({summary:passage,experience:z.array(draftEntry).max(30),projects:z.array(draftEntry).max(30),skillOrder:z.array(ref).max(200),omittedSkills:z.array(omission).max(200)}).strict();
export type Draft=z.infer<typeof draftSchema>;
export type Input=z.infer<typeof inputSchema>;
export type Issue={path:string;message:string};
const unique=(a:string[])=>new Set(a).size===a.length;
export function validateDraft(source:Source,raw:unknown){
 try{source=parseSourceGraph(source);}catch{return{draft:null,issues:[{path:'source',message:'Professional source has invalid structure or passage relationships.'}]};}
 const parsed=draftSchema.safeParse(raw);if(!parsed.success)return{draft:null,issues:parsed.error.issues.map(i=>({path:i.path.join('.'),message:i.message}))};
 const d=parsed.data,issues:Issue[]=[],add=(path:string,message:string)=>issues.push({path,message}),map=new Map(source.evidence.map(e=>[e.id,e]));
 const check=(p:z.infer<typeof passage>,path:string,parent?:string)=>{
  if(!unique(p.sourceIds))add(path,'Repeated source reference.');
  if(p.text&&!p.sourceIds.length)add(path,'Written content has no source reference.');
  if(!p.text&&p.sourceIds.length)add(path,'Empty content must not claim source coverage.');
  for(const id of p.sourceIds){const e=map.get(id);if(!e)add(path,'Unknown source reference.');else if(parent&&e.parent!==parent)add(path,'Work/project text cites another entry or a general skill, not its own facts.');}
 };
 check(d.summary,'summary');
 if(source.locks.summary&&d.summary.text!==(map.get(source.summaryId)?.text||''))add('summary','Locked summary changed.');
 for(const section of ['experience','projects'] as const){
  const ids=d[section].map(e=>e.id),expected=source[section].map(e=>e.id);
  if(source.locks[section]&&ids.join('\0')!==expected.join('\0'))add(section,'Locked section entry order changed.');
  if(!unique(ids)||ids.length!==expected.length||ids.some(id=>!expected.includes(id)))add(section,'Every original entry must appear exactly once. Entry identities are immutable.');
  for(const [n,e] of d[section].entries()){
   const path=`${section}.${n}`,original=source[section].find(o=>o.id===e.id);if(!original)continue;
   check(e.overview,path+'.overview',e.id);e.bullets.forEach((p,i)=>{if(!p.text)add(`${path}.bullets.${i}`,'Empty bullet.');check(p,`${path}.bullets.${i}`,e.id);});
   const used=new Set([e.overview,...e.bullets].filter(p=>p.text).flatMap(p=>p.sourceIds)),omitted=e.omitted.map(o=>o.sourceId),all=[original.overviewId,...original.bulletIds].filter(Boolean);
   if(!unique(omitted))add(path+'.omitted','Repeated omission.');
   for(const id of omitted)if(!all.includes(id)||used.has(id))add(path+'.omitted','Omission is unknown or also claimed as retained.');
   for(const id of all)if(!used.has(id)&&!omitted.includes(id))add(path,'A source passage vanished without an explicit omission reason.');
   if(source.locks[section]){
    if(e.overview.text!==(map.get(original.overviewId)?.text||'')||e.omitted.length||e.bullets.length!==original.bulletIds.length||e.bullets.some((b,i)=>b.text!==map.get(original.bulletIds[i])?.text||b.sourceIds.length!==1||b.sourceIds[0]!==original.bulletIds[i]))add(path,'Locked entry content or order changed.');
   }
  }
 }
 const skills=[...d.skillOrder,...d.omittedSkills.map(o=>o.sourceId)];
 if(!unique(skills)||skills.length!==source.skillIds.length||skills.some(id=>!source.skillIds.includes(id)))add('skillOrder','Every source skill must be selected once or explicitly omitted once; no invented skills.');
 if(source.locks.skills&&(d.omittedSkills.length||d.skillOrder.join()!==source.skillIds.join()))add('skillOrder','Locked skills changed.');
 return{draft:d,issues};
}
// Advisory only: number-token checks cannot establish metric meaning or scope.
// They never discard useful wording or certify a paragraph as factual.
export function numericRiskFlags(source:Source,draft:Draft):Issue[]{
 const map=new Map(source.evidence.map(e=>[e.id,e.text]));
 const numbers=(value:string)=>(value.match(/\b\d+(?:[.,]\d+)*/g)||[]).map(s=>s.replace(/,/g,''));
 const flags:Issue[]=[],check=(p:z.infer<typeof passage>,path:string)=>{
  const known=new Set(numbers(p.sourceIds.map(id=>map.get(id)||'').join(' ')));
  if(numbers(p.text).some(n=>!known.has(n)))flags.push({path,message:'A numeric value does not appear in the cited source passages. Review it; this heuristic is not a semantic verdict.'});
 };
 check(draft.summary,'summary.text');for(const section of ['experience','projects'] as const)draft[section].forEach((e,i)=>{check(e.overview,`${section}.${i}.overview.text`);e.bullets.forEach((b,j)=>check(b,`${section}.${i}.bullets.${j}.text`));});return flags;
}
