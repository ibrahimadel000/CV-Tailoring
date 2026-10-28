import {sourceScopeTails,scopeContext,retainScopeTails,scopeWarnings,type ScopeAction} from './source-scope';
import {z} from 'zod';
import {validateDraft,type Source,type Input,type Draft,type Issue} from './engine';
const id=z.string().min(1).max(100),ids=z.array(id).max(200),part=z.object({text:z.string().trim().max(2400),sourceIds:z.array(id).max(24)}).strict();
export const selectionSchema=z.object({summaryWorkIds:z.array(id).max(12),entries:z.array(z.object({id,passageIds:ids,omittedIds:ids}).strict()).max(60),skillOrder:ids,omittedSkillIds:ids,skillGroups:z.array(z.object({groupKey:id,skillIds:ids}).strict()).max(200).optional().default([])}).strict();
export type Selection=z.infer<typeof selectionSchema>;
const unique=(xs:string[])=>new Set(xs).size===xs.length;
export function groupCatalog(s:Source){return[...(s.skillGroups||[]).map((g,i)=>({groupKey:'g'+i,title:g.groupTitle||g.sectionTitle||'Skills',skillIds:g.skillIds})),{groupKey:'other',title:'Additional skills',skillIds:s.skillIds}];}
export function selectionPacket(input:Input){return{source:input.source,job:input.job};}
// Grouping is application-owned: one authoritative selected skill order, original contexts only.
function localGroups(s:Source,order:string[]){const catalog=groupCatalog(s),groups=new Map<string,{groupKey:string,skillIds:string[]}>();for(const id of order){const context=catalog.find(g=>g.groupKey!=='other'&&g.skillIds.includes(id))||catalog[catalog.length-1];if(!groups.has(context.groupKey))groups.set(context.groupKey,{groupKey:context.groupKey,skillIds:[]});groups.get(context.groupKey)!.skillIds.push(id);}return [...groups.values()];}
export function validateSelection(s:Source,raw:unknown){
 const p=selectionSchema.safeParse(raw);if(!p.success)return{selection:null,issues:p.error.issues.map(i=>({path:i.path.join('.'),message:i.message}))};
 const v=p.data,issues:Issue[]=[],add=(path:string,message:string)=>issues.push({path,message}),original=[...s.experience,...s.projects];
 if(v.entries.map(e=>e.id).join('\0')!==original.map(e=>e.id).join('\0'))add('entries','All original entry identities and their order must be preserved.');
 for(const [i,e] of v.entries.entries()){const o=original.find(o=>o.id===e.id);if(!o)continue;const all=[o.overviewId,...o.bulletIds].filter(Boolean),claimed=[...e.passageIds,...e.omittedIds];
  if(!unique(claimed)||claimed.length!==all.length||claimed.some(id=>!all.includes(id)))add(`entries.${i}`,'Each original passage must be selected once or explicitly omitted once.');
  if(all.length&&!e.passageIds.length)add(`entries.${i}`,'Cannot empty an original entry by omitting all its facts.');
  const locked=s.experience.some(x=>x.id===e.id)?s.locks.experience:s.locks.projects;
  if(locked&&(e.passageIds.join('\0')!==all.join('\0')||e.omittedIds.length))add(`entries.${i}`,'Locked entry selection/order changed.');
 }
 const allSkills=[...v.skillOrder,...v.omittedSkillIds];
 if(!unique(allSkills)||allSkills.length!==s.skillIds.length||allSkills.some(id=>!s.skillIds.includes(id)))add('skillOrder','Each source skill must be selected or explicitly omitted once.');
 if(s.locks.skills&&(v.skillOrder.join('\0')!==s.skillIds.join('\0')||v.omittedSkillIds.length||v.skillGroups.length))add('skillOrder','Locked skills changed.');
 const catalog=groupCatalog(s),grouped=v.skillGroups.flatMap(g=>g.skillIds);
 const hasLegacyGroups=!!raw&&typeof raw==='object'&&Object.prototype.hasOwnProperty.call(raw,'skillGroups');
 if(hasLegacyGroups&&!s.locks.skills&&(!unique(grouped)||grouped.length!==v.skillOrder.length||grouped.some(id=>!v.skillOrder.includes(id))))add('skillGroups','Legacy groups must contain each selected skill exactly once; unknown, omitted or repeated members are rejected.');
 for(const [i,g] of v.skillGroups.entries()){const known=catalog.find(c=>c.groupKey===g.groupKey);if(!g.skillIds.length||!known||g.skillIds.some(id=>!known.skillIds.includes(id)))add(`skillGroups.${i}`,'Group membership is not present in the original context/catalog.');}
 if(!unique(v.skillGroups.map(g=>g.groupKey)))add('skillGroups','Repeated group.');
 const selected=new Set(v.entries.flatMap(e=>e.passageIds));
 if(!unique(v.summaryWorkIds)||v.summaryWorkIds.some(id=>!selected.has(id)))add('summaryWorkIds','Summary references must be selected original work/project facts, not general skills or invented facts.');
 if(s.locks.summary&&v.summaryWorkIds.length)add('summaryWorkIds','Locked summary cannot receive a new writing plan.');
 if(!issues.length)v.skillGroups=s.locks.skills?[]:localGroups(s,v.skillOrder);
 return{selection:v,issues};
}
// Conservative text identity only; no semantic aliases, punctuation removal or skill-level promotion.
export const identityKey=(text:string)=>text.normalize('NFKC').trim().toLowerCase().replace(/\s*\/\s*/g,'/').replace(/\s+/g,' ');
export function normalizeSelection(s:Source,raw:Selection){
 const checked=validateSelection(s,raw);if(!checked.selection||checked.issues.length)throw Error('Invalid selection');
 const v=JSON.parse(JSON.stringify(checked.selection)) as Selection,duplicates:{sourceId:string,retainedId:string}[]=[];
 if(s.locks.skills)return{selection:v,duplicates};
 const map=new Map(s.evidence.map(f=>[f.id,f.text])),seen=new Map<string,string>();
 for(const id of v.skillOrder){const key=identityKey(map.get(id)||''),retained=seen.get(key);if(retained)duplicates.push({sourceId:id,retainedId:retained});else seen.set(key,id);}
 const removed=new Set(duplicates.map(d=>d.sourceId));v.omittedSkillIds.push(...removed);
 v.skillGroups=v.skillGroups.map(g=>({...g,skillIds:g.skillIds.filter(id=>!removed.has(id))})).filter(g=>g.skillIds.length);
 // Stable first-heading order, preserving each source group's original membership.
 const catalog=groupCatalog(s),buckets=new Map<string,Selection['skillGroups']>();
 for(const g of v.skillGroups){const key=identityKey(catalog.find(c=>c.groupKey===g.groupKey)!.title);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key)!.push(g);}
 v.skillGroups=catalog.filter(c=>c.groupKey!=='other').flatMap(c=>[...buckets.values()].flat().filter(g=>g.groupKey===c.groupKey)).concat([...buckets.values()].flat().filter(g=>g.groupKey==='other'));v.skillOrder=v.skillGroups.flatMap(g=>g.skillIds);
 const final=validateSelection(s,v);if(final.issues.length)throw Error('Normalization violated source coverage');
 return{selection:v,duplicates};
}
export const realizationSchema=z.object({summary:part,entries:z.array(z.object({id,overview:part,bullets:z.array(part).max(40)}).strict()).max(60)}).strict();
export function writerPacket(s:Source,selection:Selection,job:string=''){
 const map=new Map(s.evidence.map(f=>[f.id,f]));
 const tails=sourceScopeTails(s);
 const fact=(id:string)=>{const f=map.get(id)!,tail=tails.find(t=>t.sourceId===id);return{id:f.id,text:tail?f.text.slice(0,tail.start).trim().replace(/[;؛,.!?؟]+$/u,'').trim():f.text,origin:s.experience.some(e=>[e.overviewId,...e.bulletIds].includes(id))?'work':'project'};};
 const listedSkills=s.locks.summary?[]:selection.skillOrder.map(id=>({id,text:map.get(id)!.text,kind:'listed_skill_not_employer_evidence',originalGroups:(s.skillGroups||[]).filter(g=>g.skillIds.includes(id)).map(g=>({sectionTitle:g.sectionTitle,groupTitle:g.groupTitle}))}));
 return{sourceScope:{role:'read_only_limits_even_when_passage_not_selected',entries:scopeContext(s),retainedTails:sourceScopeTails(s)},headline:s.headline,direction:{jobDescription:job,role:'focus_only_not_candidate_evidence'},summaryFacts:selection.summaryWorkIds.map(fact),listedSkills,entries:selection.entries.filter(e=>{const work=s.experience.some(o=>o.id===e.id);return !(work?s.locks.experience:s.locks.projects);}).map(e=>({id:e.id,origin:s.experience.some(o=>o.id===e.id)?'work':'project',passages:e.passageIds.map(fact)}))};
 // Direction and listed skills have separate roles; they cannot be cited by entry writing.
 // No original generic summary, employer metadata, plan rationale or previous draft.
}
const omissionReason='Lower-priority content selected for omission by the content planner; the original remains available.';
export function materialize(s:Source,selection:Selection,raw:unknown,summaryContextIds:string[]=[],summarySkillIds:string[]=selection.skillOrder){
 const checked=validateSelection(s,selection);if(!checked.selection||checked.issues.length)return{draft:null,issues:checked.issues};
 const p=realizationSchema.safeParse(raw);if(!p.success)return{draft:null,issues:p.error.issues.map(i=>({path:i.path.join('.'),message:i.message}))};
 const v=p.data,scopeActions:ScopeAction[]=[],tails=sourceScopeTails(s),issues:Issue[]=[],add=(path:string,message:string)=>issues.push({path,message}),packet=writerPacket(s,selection),facts=new Map(s.evidence.map(f=>[f.id,f.text]));
 const expected=packet.entries.map(e=>e.id),got=v.entries.map(e=>e.id);
 if(!unique(got)||got.length!==expected.length||got.some(id=>!expected.includes(id)))add('entries','Output must contain exactly the unlocked original entries, with no invented identities.');
 const inspect=(p:z.infer<typeof part>,allowed:string[],path:string)=>{if(p.sourceIds.some(id=>!allowed.includes(id)))add(path,'Writing references a fact outside this selected writing unit.');};
 const summaryAllowed=s.locks.summary?[]:[...selection.summaryWorkIds,...summarySkillIds,...summaryContextIds];
 inspect(v.summary,summaryAllowed,'summary');
 if(!s.locks.summary&&summaryAllowed.length&&!v.summary.text)add('summary','An authorized summary cannot silently disappear.');
 if((s.locks.summary||!summaryAllowed.length)&&(v.summary.text||v.summary.sourceIds.length))add('summary','No summary rewrite is authorized; return an empty placeholder.');
 const summary=(s.locks.summary||!summaryAllowed.length)?{text:facts.get(s.summaryId)||'',sourceIds:s.summaryId?[s.summaryId]:[]}:v.summary;
 const entries=(section:'experience'|'projects')=>s[section].map(o=>{const plan=selection.entries.find(e=>e.id===o.id)!,output=v.entries.find(e=>e.id===o.id),locked=s.locks[section];
  if(locked)return{id:o.id,overview:{text:facts.get(o.overviewId)||'',sourceIds:o.overviewId?[o.overviewId]:[]},bullets:o.bulletIds.map(id=>({text:facts.get(id)||'',sourceIds:[id]})),omitted:[]};
  const fallback={id:o.id,overview:{text:'',sourceIds:[]},bullets:[]},rawEntry=output||fallback;
  const e={...rawEntry,overview:retainScopeTails(rawEntry.overview,tails,`${section}.${o.id}.overview`,scopeActions),bullets:rawEntry.bullets.map((p,j)=>retainScopeTails(p,tails,`${section}.${o.id}.bullets.${j}`,scopeActions))};
  for(const [j,p] of [e.overview,...e.bullets].entries())inspect(p,plan.passageIds,`${section}.${o.id}.${j}`);
  return{...e,omitted:plan.omittedIds.map(sourceId=>({sourceId,reason:omissionReason}))};
 });
 const draft:Draft={summary,experience:entries('experience'),projects:entries('projects'),skillOrder:selection.skillOrder,omittedSkills:selection.omittedSkillIds.map(sourceId=>({sourceId,reason:selection.skillOrder.some(id=>identityKey(facts.get(id)||'')===identityKey(facts.get(sourceId)||''))?'Local text-equivalent duplicate of a retained skill; original remains available.':omissionReason}))};
 const core=validateDraft(s,draft);issues.push(...core.issues);return{draft:issues.length?null:draft,issues,scopeActions:issues.length?[]:scopeActions};
}
export function displayGroups(s:Source,v:Selection){const c=groupCatalog(s),out:{title:string,skillIds:string[]}[]=[];for(const g of v.skillGroups){const title=c.find(c=>c.groupKey===g.groupKey)!.title,existing=out.find(x=>identityKey(x.title)===identityKey(title));if(existing)existing.skillIds.push(...g.skillIds);else out.push({title,skillIds:[...g.skillIds]});}return out;}
export function editorialDiagnostics(s:Source,draft:Draft){
 const flags:{code:string,path:string,message:string}[]=[],summary=draft.summary.text.trim(),map=new Map(s.evidence.map(f=>[f.id,f.text]));
 if(!s.locks.summary&&draft.summary.sourceIds.length>1&&summary===draft.summary.sourceIds.map(id=>map.get(id)||'').join(' '))flags.push({code:'summary_source_concatenation',path:'summary',message:'Summary concatenates complete source passages rather than synthesizing them.'});
 const bullets=[...draft.experience,...draft.projects].flatMap(e=>e.bullets);
 if(!s.locks.summary&&bullets.some(b=>b.text.length>=60&&identityKey(summary).includes(identityKey(b.text))))flags.push({code:'summary_repeats_bullet',path:'summary',message:'Summary repeats a complete achievement; consider concise synthesis.'});
 if(!s.locks.summary&&summary.split(/\s+/).filter(Boolean).length>75)flags.push({code:'long_summary',path:'summary',message:'Summary exceeds the advisory 75-word guideline; language and context still require review.'});
 for(const e of [...draft.experience,...draft.projects])if(e.overview.text&&e.bullets.some(b=>identityKey(b.text)===identityKey(e.overview.text)))flags.push({code:'overview_repeats_bullet',path:e.id,message:'Overview duplicates a bullet.'});
 flags.push(...scopeWarnings(s,draft));
 return flags; // Editorial signals only. No factual verdict or forced rewrite/retry.
}
const str={type:'STRING'},arr=(items:unknown)=>({type:'ARRAY',items}),obj=(properties:Record<string,unknown>)=>({type:'OBJECT',properties,required:Object.keys(properties)});
const para=obj({text:str,sourceIds:arr(str)});
export const selectionOutputSchema=obj({summaryWorkIds:arr(str),entries:arr(obj({id:str,passageIds:arr(str),omittedIds:arr(str)})),skillOrder:arr(str),omittedSkillIds:arr(str)});
export const realizationOutputSchema=obj({summary:para,entries:arr(obj({id:str,overview:para,bullets:arr(para)}))});
