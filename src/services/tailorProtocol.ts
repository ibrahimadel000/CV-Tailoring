import { z } from 'zod';
import type { CVProfile } from '@/types/schema';
import { evidenceCatalog, invalidTailorFormat, prepareTailorInput, tailorPatchSchema, TailorError, type TailorPatch } from '@/services/tailorModel';

type Kind = 'headline'|'summary'|'listed_skill'|'work_role'|'work_achievement'|'project'|'project_achievement'|'education'|'certification'|'professional_context'|'user_confirmed_account';
type Binding = { id:string; kind:Kind; parent?:string };
export type TailorReferenceMap = ReadonlyMap<string,Readonly<Binding>>;
// Provider shape is bounded locally, but wire identifiers are short references,
// not database UUIDs. No new grammar constraints are sent to Gemini.
const ref=z.string().trim().min(1).max(120);
const planRowSchema=tailorPatchSchema.shape.contentPlan.removeDefault().unwrap().element;
export const wireTailorPatchSchema=tailorPatchSchema.extend({
  // Isolate malformed bounded plan rows, not the whole usable response. The
  // canonical patch still accepts only strictly checked rows (32 refs max).
  contentPlan:z.array(z.unknown()).max(16).optional().default([]),
  skillGroups:z.array(z.object({category:z.enum(['Technical','Soft','Tools','Languages']),skillIds:z.array(ref).min(1).max(150)}).strict()).max(4).optional().default([]),
  bullets:z.array(tailorPatchSchema.shape.bullets.element.extend({entryId:ref,bulletId:ref}).strict()).max(32),
  skillOrder:z.array(ref).max(150),
  bulletOrder:z.array(z.object({section:z.enum(['experience','projects']),entryId:ref,bulletIds:z.array(ref).min(1).max(32),jobQuote:z.string().trim().min(3).max(280)}).strict()).max(12).optional().default([]),
}).strict();

export function buildTailorEnvelope(source:CVProfile, job:string) {
  const input=prepareTailorInput(source,job),p=input.payload,catalog=evidenceCatalog(source);
  const bindings=new Map<string,Binding>(),byId=new Map<string,string>();
  const bind=(alias:string,id:string,kind:Kind,parent?:string)=>{
    if(bindings.has(alias)||byId.has(id)) throw new TailorError('input','Duplicate source identifiers. Nothing was sent; use a clean source copy.');
    bindings.set(alias,Object.freeze({id,kind,...(parent?{parent}:{})}));byId.set(id,alias);return alias;
  };
  bind('headline','headline','headline');bind('summary','summary','summary');
  const payload={...p,
    supportingEvidence:p.supportingEvidence.map((e,i)=>({...e,id:bind(`account_${i+1}`,e.id,'user_confirmed_account')})),
    summary:{...p.summary,id:'summary'},
    skills:{...p.skills,items:p.skills.items.map((s,i)=>({...s,id:bind(`skill_${i+1}`,s.id,'listed_skill')}))},
    experience:{...p.experience,items:p.experience.items.map((e,i)=>{
      const id=bind(`work_${i+1}`,e.id,'work_role');return {...e,id,bullets:e.bullets.map((b,j)=>({...b,id:bind(`${id}_bullet_${j+1}`,b.id,'work_achievement',id)}))};
    })},
    projects:{...p.projects,items:p.projects.items.map((e,i)=>{
      const id=bind(`project_${i+1}`,e.id,'project');return {...e,id,bullets:e.bullets.map((b,j)=>({...b,id:bind(`${id}_bullet_${j+1}`,b.id,'project_achievement',id)}))};
    })},
    education:p.education.map((e,i)=>({...e,id:bind(`education_${i+1}`,e.id,'education')})),
    certifications:p.certifications.map((c,i)=>({...c,id:bind(`cert_${i+1}`,c.id,'certification')})),
    context:p.context.map((c,i)=>({...c,id:bind(`extra_${i+1}`,c.id,'professional_context')})),
  };
  // Compact type index only: fact text appears once, in payload. A role's
  // overview does not authorize another passage, and a skill is not work proof.
  const sourceIndex=[...bindings].filter(([,b])=>catalog.has(b.id)).map(([id,b])=>({id,kind:b.kind}));
  return {wire:{payload,job:input.job,sourceIndex},references:bindings as TailorReferenceMap};
}

export function decodeTailorResponse(raw:unknown,references:TailorReferenceMap):{patch:TailorPatch;warnings:string[]} {
  const parsed=wireTailorPatchSchema.safeParse(raw);if(!parsed.success) throw invalidTailorFormat(parsed.error);
  const wire=parsed.data,warnings:string[]=[];
  // Unknown evidence stays unknown to the canonical validator. Do not invent
  // citations, choose similar names, borrow a whole entry, or expose raw refs.
  const unknown=new Map<string,string>();
  const evidenceId=(alias:string)=>{
    const b=references.get(alias);if(b)return b.id;
    if(!unknown.has(alias))unknown.set(alias,`unresolved_reference_${unknown.size+1}`);
    return unknown.get(alias)!;
  };
  const skillRefs=wire.skillOrder;
  const repeated=skillRefs.length-new Set(skillRefs).size;
  const outside=skillRefs.filter(r=>references.get(r)?.kind!=='listed_skill').length;
  let skillOrder:string[]=[];
  if(repeated||outside) warnings.push(`Skill order omitted: ${repeated} repeated ID(s), ${outside} ID(s) outside the source skill list. Original skills and order kept; other checked suggestions still require your review.`);
  else skillOrder=skillRefs.map(r=>references.get(r)!.id);
  const bullets:TailorPatch['bullets']=[];let omittedBullets=0;
  for(const b of wire.bullets){
    const entry=references.get(b.entryId),bullet=references.get(b.bulletId);
    const entryKind=b.section==='experience'?'work_role':'project';
    const bulletKind=b.section==='experience'?'work_achievement':'project_achievement';
    if(entry?.kind!==entryKind||bullet?.kind!==bulletKind||bullet.parent!==b.entryId){omittedBullets++;continue;}
    bullets.push({...b,entryId:entry.id,bulletId:bullet.id});
  }
  if(omittedBullets)warnings.push(`Achievement rewrites omitted: ${omittedBullets} suggestion(s) referenced an unknown passage, wrong section or wrong parent. No passage was guessed; original wording kept.`);
  const bulletOrder:TailorPatch['bulletOrder']=[];let omittedOrders=0;
  for(const o of wire.bulletOrder){
    const entry=references.get(o.entryId),entryKind=o.section==='experience'?'work_role':'project';
    const bulletKind=o.section==='experience'?'work_achievement':'project_achievement';
    const expected=[...references].filter(([,b])=>b.kind===bulletKind&&b.parent===o.entryId).map(([alias])=>alias);
    if(entry?.kind!==entryKind||new Set(o.bulletIds).size!==o.bulletIds.length||o.bulletIds.length!==expected.length||o.bulletIds.some(r=>!expected.includes(r))){omittedOrders++;continue;}
    bulletOrder.push({...o,entryId:entry.id,bulletIds:o.bulletIds.map(r=>references.get(r)!.id)});
  }
  if(omittedOrders)warnings.push(`Achievement orders omitted: ${omittedOrders} suggestion(s) did not reference every original passage exactly once in its own entry. Original order kept.`);
  const contentPlan:TailorPatch['contentPlan']=[];let omittedPlanRows=0;
  for(const rawRow of wire.contentPlan){
    const row=planRowSchema.safeParse(rawRow);
    if(!row.success){omittedPlanRows++;continue;}
    const value=row.data;
    contentPlan.push({...value,entryId:value.entryId?evidenceId(value.entryId):'',bulletId:value.bulletId?evidenceId(value.bulletId):'',evidenceIds:value.evidenceIds.map(evidenceId)});
  }
  if(omittedPlanRows)warnings.push(`Content plan item(s) omitted: ${omittedPlanRows} invalid or oversized item(s). Their dependent proposals are unavailable; independent checked suggestions remain for review. No references were trimmed, guessed or repaired; no extra AI request was made.`);
  let skillGroups:TailorPatch['skillGroups']=[];
  if(wire.skillGroups.some(g=>g.skillIds.some(id=>references.get(id)?.kind!=='listed_skill')))warnings.push('Skill grouping omitted: a reference was outside the source skill list. No replacement was guessed.');
  else skillGroups=wire.skillGroups.map(g=>({...g,skillIds:g.skillIds.map(id=>references.get(id)!.id)}));
  const patch:TailorPatch={...wire,contentPlan,skillGroups,skillOrder,bullets,bulletOrder,
    summaryEvidenceIds:wire.summaryEvidenceIds.map(evidenceId),
    requirements:wire.requirements.map(r=>({...r,evidenceIds:r.evidenceIds.map(evidenceId)})),
  };
  // Canonical UUID/text/array schema is still required after transport mapping.
  const canonical=tailorPatchSchema.safeParse(patch);if(!canonical.success)throw invalidTailorFormat(canonical.error);
  return {patch:canonical.data,warnings};
}
