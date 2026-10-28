import { z } from 'zod';
import type { CVProfile } from '@/types/schema';
import { buildTailorEnvelope } from '@/services/tailorProtocol';
import { buildFactBank } from '@/services/composer/factBank';
import { decodeComposition } from '@/services/composer/protocol';
import { jobInventory, type JobPassage } from '@/services/composer/job';
import { formatIssues, omittedRow, type CompositionDiagnostics } from '@/services/composer/diagnostics';
import { TailorError } from '@/services/tailorModel';
const ref=z.string().trim().min(1).max(120);
const envelope=z.object({jobTitle:z.string().trim().max(160),company:z.string().trim().max(160),summary:z.array(z.unknown()).max(4),experience:z.array(z.unknown()).max(12),projects:z.array(z.unknown()).max(12),skillOrder:z.array(z.unknown()).max(150),skillGroups:z.array(z.unknown()).max(4),requirements:z.array(z.unknown()).max(60)}).strict();
const work=z.object({id:ref,overview:z.unknown(),bullets:z.array(z.unknown()).max(32)}).strict();
const project=z.object({id:ref,bullets:z.array(z.unknown()).max(32)}).strict();
const bullet=z.object({id:ref,text:z.string().trim().min(1).max(900)}).strict();
const assessment=z.object({id:ref,status:z.enum(['supported','related','not_found']),evidenceIds:z.array(ref).max(8)}).strict();
export type DraftOverview={entryId:string;text:string};
export type DraftOrder={section:'experience'|'projects';entryId:string;bulletIds:string[]};
export function buildDraftInput(source:CVProfile,job:string){
  const {wire}=buildTailorEnvelope(source,job),inventory=jobInventory(job);
  const facts=buildFactBank(source,job);
  return {facts,inventory,wire:{resume:wire.payload,sourceIndex:wire.sourceIndex,job:wire.job,jobPassages:inventory.passages}};
}
// Closed enums for IDs in the document draft; parent membership is still checked
// locally. Never infer an ID from a sentence, substring or similar source text.
export function draftOutputSchema(facts:ReturnType<typeof buildFactBank>){
  const ids=(kind:string)=>facts.passages.filter(p=>p.kind===kind).map(p=>p.id);
  const str={type:'STRING'},id=(values:string[])=>values.length?{type:'STRING',enum:values}:str;
  const arr=(items:unknown)=>({type:'ARRAY',items});
  const obj=(properties:Record<string,unknown>)=>({type:'OBJECT',properties,required:Object.keys(properties)});
  const row=(kind:string)=>obj({id:id(ids(kind)),text:str});
  return obj({jobTitle:str,company:str,summary:arr(obj({text:str,evidenceIds:arr(str)})),
    experience:arr(obj({id:id(ids('work_role')),overview:str,bullets:arr(row('work_achievement'))})),
    projects:arr(obj({id:id(ids('project')),bullets:arr(row('project_achievement'))})),
    skillOrder:arr(id(ids('listed_skill'))),skillGroups:arr(obj({category:{type:'STRING',enum:['Technical','Soft','Tools','Languages']},skillIds:arr(str)})),
    requirements:arr(obj({id:str,status:{type:'STRING',enum:['supported','related','not_found']},evidenceIds:arr(str)}))});
}
export function decodeDraft(raw:unknown,facts:ReturnType<typeof buildFactBank>,jobs:JobPassage[],source:CVProfile){
  const parsed=envelope.safeParse(raw);
  if(!parsed.success)throw new TailorError('invalid','Invalid structured draft: '+formatIssues(parsed.error).join('; ')+'. No resume was changed; no automatic retry.');
  const value=parsed.data;
  // Reuse the bounded sentence/reference validator, not the old edit contract.
  const decoded=decodeComposition({jobTitle:value.jobTitle,company:value.company,summary:value.summary,edits:[],requirements:[],skillOrder:value.skillOrder,skillGroups:value.skillGroups,bulletOrder:[]},facts,jobs,source);
  const diagnostics:CompositionDiagnostics=decoded.diagnostics,warnings=decoded.warnings;
  diagnostics.received.requirements=value.requirements.length;
  const draftOverviews:DraftOverview[]=[],draftOrders:DraftOrder[]=[];
  const byAlias=new Map(facts.passages.map(p=>[p.id,p]));
  const omitted=(row:unknown,index:number,issues:string[])=>diagnostics.omitted.push(omittedRow('edits',index,row,issues));
  let passageIndex=0;
  for(const section of ['experience','projects'] as const){
    const seenEntries=new Set<string>();
    for(const [entryIndex,rawEntry] of value[section].entries()){
      const e=section==='experience'?work.safeParse(rawEntry):project.safeParse(rawEntry);
      if(!e.success){omitted(rawEntry,passageIndex++,formatIssues(e.error).map(s=>`${section}[${entryIndex+1}].${s}`));continue;}
      const entry=e.data,binding=facts.references.get(entry.id),kind=section==='experience'?'work_role':'project';
      if(binding?.kind!==kind||seenEntries.has(entry.id)){omitted(rawEntry,passageIndex++,[`${section}: unknown or repeated entry ID.`]);continue;}
      seenEntries.add(entry.id);
      if(section==='experience'){
        const overview=z.string().trim().max(1800).safeParse('overview' in entry?entry.overview:undefined);
        diagnostics.received.edits++;
        if(!overview.success)omitted(rawEntry,passageIndex++,formatIssues(overview.error).map(s=>'overview.'+s));
        else {draftOverviews.push({entryId:binding.id,text:overview.data});diagnostics.forwarded.edits++;passageIndex++;}
      }
      const expected=facts.passages.filter(p=>p.parent===entry.id&&(p.kind==='work_achievement'||p.kind==='project_achievement')).map(p=>p.id),seen=new Set<string>(),ordered:string[]=[];
      let validOrder=true;
      for(const rawBullet of entry.bullets){
        diagnostics.received.edits++;
        const index=passageIndex++,b=bullet.safeParse(rawBullet);
        if(!b.success){omitted(rawBullet,index,formatIssues(b.error));validOrder=false;continue;}
        const p=byAlias.get(b.data.id),bound=facts.references.get(b.data.id);
        if(!p||!bound||p.parent!==entry.id||!expected.includes(p.id)||seen.has(p.id)){omitted(rawBullet,index,['Unknown, wrong-parent or repeated achievement ID. No source passage was guessed.']);validOrder=false;continue;}
        seen.add(p.id);ordered.push(bound.id);
        decoded.patch.bullets.push({section,entryId:binding.id,bulletId:bound.id,text:b.data.text,jobQuote:''});
        diagnostics.forwarded.edits++;
      }
      const missing=expected.filter(id=>!seen.has(id));
      if(missing.length)warnings.push(`${section} entry ${entryIndex+1}: ${missing.length} source achievement(s) absent from the draft. Original text retained; no deletion.`);
      // Document order is an editorial decision, not conditional on a supported
      // qualification label. Apply only a complete permutation of that parent.
      if(validOrder&&!missing.length&&ordered.length===expected.length){draftOrders.push({section,entryId:binding.id,bulletIds:ordered});diagnostics.received.bulletOrder++;diagnostics.forwarded.bulletOrder++;}
    }
    const absent=facts.passages.filter(p=>p.kind===(section==='experience'?'work_role':'project')&&!seenEntries.has(p.id)).length;
    if(absent)warnings.push(`${section}: ${absent} source entry/entries absent from the draft. Original entries retained.`);
  }
  const seenJobs=new Set<string>();
  for(const [index,row] of value.requirements.entries()){
    const r=assessment.safeParse(row);
    if(!r.success){diagnostics.omitted.push(omittedRow('requirements',index,row,formatIssues(r.error)));continue;}
    const job=jobs.find(j=>j.id===r.data.id);
    if(!job||seenJobs.has(job.id)){diagnostics.omitted.push(omittedRow('requirements',index,row,['Unknown or repeated requirement ID.']));continue;}
    seenJobs.add(job.id);
    const aliases=r.data.evidenceIds,ids=aliases.map(id=>facts.references.get(id)?.id??'');
    if(new Set(aliases).size!==aliases.length||ids.some(id=>!id)||(r.data.status==='not_found'?ids.length>0:ids.length===0)){
      diagnostics.omitted.push(omittedRow('requirements',index,row,['Missing, repeated or unknown evidence reference(s), or references inconsistent with status.']));continue;
    }
    decoded.patch.requirements.push({requirement:job.text.slice(0,180),jobQuote:job.text,status:r.data.status,evidenceIds:ids});diagnostics.forwarded.requirements++;
  }
  // The full draft is bounded to the canonical transport's 32 achievement rows.
  // Reject oversized drafts rather than silently shortening the document.
  if(decoded.patch.bullets.length>32)throw new TailorError('invalid','Draft exceeds the 32-achievement processing limit. No source text was removed or changed.');
  if(diagnostics.omitted.length)warnings.push('Some structured-draft items were omitted. Open Response diagnostics; original passages are preserved.');
  return {...decoded,draftOverviews,draftOrders};
}
