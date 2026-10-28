import { resumeBlocks, displaySkillGroups } from '@/components/builder/resumeModel';
import type { CVProfile, SkillTag } from '@/types/schema';
import type { applyTailorPatch } from '@/services/tailorModel';
import type { ComposerReason } from '@/services/composer/protocol';
import { evidenceCatalog } from '@/services/tailorModel';
import { planLinks } from '@/services/tailorContentPlan';
// Source maps are derived AFTER checks; they can never block an independently
// supported sentence because a model forgot a duplicate planning row.
export function deriveCompositionReview(source:CVProfile,result:ReturnType<typeof applyTailorPatch>,reasons:ComposerReason[]){
 const catalog=evidenceCatalog(source);result.contentPlan=[];
 for(const change of result.changes){
  const isSkill=['skills','skill_groups'].includes(change.area),isSummary=change.area==='summary';
  const reason=change.bulletId?reasons.find(r=>r.bulletId===change.bulletId):undefined;
  if(reason)change.explanation=reason.why;
  const evidence=isSummary?result.summaryEvidence:isSkill?source.skills.data.map(s=>catalog.get(s.id)!).filter(Boolean):change.bulletId?[catalog.get(change.bulletId)!].filter(Boolean):change.textField==='description'&&change.entryId?[catalog.get(change.entryId)!].filter(Boolean):[];
  const assessment=result.requirements.find(r=>r.status!=='not_found'&&r.evidence.some(e=>evidence.some(v=>v.id===e.id)));
  const quote=reason?.jobQuote||assessment?.jobQuote;
  if(!quote||!evidence.length||result.contentPlan.length>=16||isSkill&&result.contentPlan.some(p=>p.target==='skills'))continue;
  const target=isSkill?'skills':isSummary?'summary':change.area==='projects'?'projects':'experience';
  result.contentPlan.push({target,entryId:change.entryId??'',bulletId:change.bulletId??'',intent:isSkill?'organize_skills':isSummary?'surface_relevance':'clarify_scope',jobQuote:quote,evidence:evidence.slice(0,32)});
 }
 for(const c of result.changes){const target=c.area==='skills'||c.area==='skill_groups'?'skills':c.area==='summary'?'summary':c.area==='projects'?'projects':'experience';c.planRefs=planLinks(result.contentPlan,target,c.entryId,c.bulletId);}
}
export function compositionDocument(source:CVProfile,result:ReturnType<typeof applyTailorPatch>){
 const rows:CompositionRow[]=[];
 const add=(label:string,text:string,extra:Partial<CompositionRow>={})=>rows.push({label,text,...extra});
 add('Professional headline',source.resumeHeader.data.desiredJobPosition||source.headline.data);
 for(const block of resumeBlocks(source)){
  if(block.id==='summary'){add('Professional summary',block.items[0]?.text??'',{summary:true});continue;}
  if(block.id==='skills'){
   add('Skills',displaySkillGroups(source.skills.data).map(g=>g.title+': '+g.text).join('\n'),{skills:{source:source.skills.data,draft:result.copy.skills.data,orderIndex:result.changes.findIndex(c=>c.area==='skills'),groupsIndex:result.changes.findIndex(c=>c.area==='skill_groups')}});continue;
  }
  if(block.id==='experience'||block.id==='projects'){
   const section=block.id;
   for(const item of block.items){
    const entry=source[section].data.find(e=>e.id===item.entryId)!;
    const orderIndex=result.changes.findIndex(c=>c.area==='bullet_order'&&c.entryId===entry.id);
    add(section==='experience'?'Work experience':'Project',[item.title,item.subtitle,item.date].filter(Boolean).join(' · '),{entryId:entry.id,...(orderIndex>=0?{orderIndex,orderIds:result.copy[section].data.find(e=>e.id===entry.id)!.bullets.map(b=>b.id)}:{})});
    if(item.text){const index=result.changes.findIndex(c=>c.area===section&&c.entryId===entry.id&&c.textField==='description');add('Role overview',item.text,{entryId:entry.id,changeIndex:index>=0?index:undefined});}
    for(const bullet of entry.bullets){const index=result.changes.findIndex(c=>c.area===section&&c.bulletId===bullet.id&&!c.textField);add('Achievement',bullet.text,{entryId:entry.id,bulletId:bullet.id,changeIndex:index>=0?index:undefined});}
   }
   continue;
  }
  for(const item of block.items)add(block.title,[item.title,item.subtitle,item.date,item.text,...(item.bullets??[])].filter(Boolean).join(' · '));
 }
 if(!rows.some(r=>r.summary))rows.splice(1,0,{label:'Professional summary',text:source.summary.data,summary:true});
 return rows;
}
export type CompositionRow={label:string;text:string;summary?:boolean;changeIndex?:number;entryId?:string;bulletId?:string;orderIndex?:number;orderIds?:string[];skills?:{source:SkillTag[];draft:SkillTag[];orderIndex:number;groupsIndex:number}};
export function selectedDocumentRows(rows:CompositionRow[],selected:number[]){
 const result:CompositionRow[]=[];
 for(let i=0;i<rows.length;i++){
  const row=rows[i];
  if(row.skills){const {source,draft,orderIndex,groupsIndex}=row.skills,categories=new Map((selected.includes(groupsIndex)?draft:source).map(s=>[s.id,s.category]));const skills=(selected.includes(orderIndex)?draft:source).map(s=>({...s,category:categories.get(s.id)!}));result.push({...row,text:displaySkillGroups(skills).map(g=>g.title+': '+g.text).join('\n')});}else result.push(row);
  if(row.orderIndex===undefined||!selected.includes(row.orderIndex)||!row.orderIds)continue;
  if(rows[i+1]?.label==='Role overview'&&rows[i+1].entryId===row.entryId)result.push(rows[++i]);
  const bullets:CompositionRow[]=[];while(rows[i+1]?.bulletId&&rows[i+1].entryId===row.entryId)bullets.push(rows[++i]);
  result.push(...row.orderIds.map(id=>bullets.find(b=>b.bulletId===id)!).filter(Boolean));
 }
 return result;
}
