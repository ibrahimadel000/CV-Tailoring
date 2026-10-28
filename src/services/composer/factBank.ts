import type { CVProfile } from '@/types/schema';
import type { FactBank } from '@/vendor/resume-tailor-ai/types';
import { buildTailorEnvelope } from '@/services/tailorProtocol';
// The upstream FactBank/Version model is used as an immutable professional
// projection, NOT a company-name merge or permission to change a job title.
export function buildFactBank(source:CVProfile,job:string){
  const envelope=buildTailorEnvelope(source,job),p=envelope.wire.payload;
  const bank:Omit<FactBank,'contact'>={
    experiences:p.experience.items.map(e=>({id:e.id,company:e.company,location:'',startDate:e.start,endDate:e.end,
      versions:[{id:e.id,title:e.role,bullets:e.bullets.map(b=>b.text)}]})),
    education:p.education.map(e=>({id:e.id,school:e.institution,degree:e.degree,location:'',field:'',startDate:'',endDate:e.graduation??'',notes:e.gpa?[e.gpa]:[]})),
    skills:p.skills.items.map(s=>s.name),
    projects:p.projects.items.map(e=>({id:e.id,name:e.name,startDate:'',endDate:'',bullets:e.bullets.map(b=>b.text)})),
  };
  // FactBank drives passage construction; no contact, source-file name or
  // alternate title is serialized. Text is sent once, with scoped stable refs.
  const passages=envelope.wire.sourceIndex.map(ref=>{
    let text='';
    if(ref.kind==='headline')text=p.headline;
    else if(ref.kind==='summary')text=p.summary.text;
    else if(ref.kind==='listed_skill'){const s=p.skills.items.find(s=>s.id===ref.id)!;text=[s.name,s.level].filter(Boolean).join(' · ');}
    else if(ref.kind==='work_role'){const e=bank.experiences.find(e=>e.id===ref.id)!;text=[e.versions[0].title,e.company,e.startDate,e.endDate,p.experience.items.find(v=>v.id===e.id)?.overview].filter(Boolean).join(' · ');}
    else if(ref.kind==='work_achievement'){for(const e of p.experience.items){const i=e.bullets.findIndex(b=>b.id===ref.id);if(i>=0)text=bank.experiences.find(v=>v.id===e.id)!.versions[0].bullets[i];}}
    else if(ref.kind==='project'){const e=p.projects.items.find(e=>e.id===ref.id)!;text=[e.name,e.role].filter(Boolean).join(' · ');}
    else if(ref.kind==='project_achievement'){for(const e of p.projects.items){const i=e.bullets.findIndex(b=>b.id===ref.id);if(i>=0)text=bank.projects!.find(v=>v.id===e.id)!.bullets[i];}}
    else if(ref.kind==='education'){const e=bank.education.find(e=>e.id===ref.id)!;const detail=p.education.find(v=>v.id===ref.id)!;text=[e.degree,e.school,e.endDate,...e.notes,detail.details,...(detail.honors??[])].filter(Boolean).join(' · ');}
    else if(ref.kind==='certification'){const c=p.certifications.find(c=>c.id===ref.id)!;text=[c.name,c.issuer,c.date].filter(Boolean).join(' · ');}
    else if(ref.kind==='professional_context')text=p.context.find(c=>c.id===ref.id)!.text;
    else {const e=p.supportingEvidence.find(e=>e.id===ref.id)!;text=[e.title,e.task,e.tools,e.outcome].join(' · ');}
    const b=envelope.references.get(ref.id)!;
    const section=ref.kind.startsWith('work_')?'experience':ref.kind.startsWith('project')?'projects':ref.kind==='summary'?'summary':ref.kind==='listed_skill'?'skills':undefined;
    return {...ref,text,...(b.parent?{parent:b.parent}:{}),editable:section? !p[section].locked&&['summary','listed_skill','work_achievement','project_achievement'].includes(ref.kind):false};
  });
  return {bank,passages,references:envelope.references};
}
