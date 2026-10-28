import type { CVProfile } from '@/types/schema';
import { TailorError, type TailorChange, type SummaryAlternative, type applyTailorPatch } from '@/services/tailorModel';
export type CheckedTailorResult = ReturnType<typeof applyTailorPatch>;
export type ReviewSelection = { selectedChanges: number[]; summary: 'original' | 'generated' | 'source_based' };
// A proposed tailored draft is selected by default, not silently replaced with
// the original merely for using natural new phrasing. Saving is still explicit.
export function initialReviewSelection(changes: TailorChange[]): ReviewSelection {
  return { selectedChanges: changes.flatMap((c,i) => c.area === 'summary' ? [] : [i]),
    summary: changes.some(c => c.area === 'summary') ? 'generated' : 'original' };
}
export function selectTailorChanges(source: CVProfile, result: CheckedTailorResult, selection: ReviewSelection, alternative?: SummaryAlternative) {
  if (!['original','generated','source_based'].includes(selection.summary) || !Array.isArray(selection.selectedChanges) || new Set(selection.selectedChanges).size!==selection.selectedChanges.length || selection.selectedChanges.some(i=>!Number.isInteger(i)||i<0||i>=result.changes.length||result.changes[i].area==='summary')) {
    throw new TailorError('invalid','Invalid review selection. Your resumes are unchanged.');
  }
  const copy:CVProfile=JSON.parse(JSON.stringify(source)); const changes:TailorChange[]=[];
  let summaryEvidence:CheckedTailorResult['summaryEvidence']=[];
  const generated=result.changes.find(c=>c.area==='summary');
  if(selection.summary==='generated') {
    if(!generated || source.summary.isLocked) throw new TailorError('invalid','No checked generated summary is available.');
    copy.summary.data=generated.after; changes.push({...generated,origin:'ai'}); summaryEvidence=result.summaryEvidence;
  } else if(selection.summary==='source_based') {
    if(!alternative || source.summary.isLocked) throw new TailorError('invalid','No checked summary alternative is available.');
    copy.summary.data=alternative.text;changes.push({area:'summary',before:source.summary.data,after:alternative.text,origin:'source_based'});summaryEvidence=alternative.evidence;
  }
  // Apply wording before order, even if the selection array arrives in another order.
  const selected=result.changes.filter((_,i)=>selection.selectedChanges.includes(i));
  for(const change of selected.filter(c=>c.area!=='bullet_order')) {
    if(change.area==='skills') {
      if(copy.skills.isLocked) throw new TailorError('invalid','Skills are locked.');
      const byId=new Map(copy.skills.data.map(s=>[s.id,s]));copy.skills.data=result.copy.skills.data.map(s=>({...byId.get(s.id)!}));changes.push({...change,origin:'ai'});continue;
    }
    if(change.area==='skill_groups'){
      if(copy.skills.isLocked)throw new TailorError('invalid','Skills are locked.');
      const categories=new Map(result.copy.skills.data.map(s=>[s.id,s.category]));copy.skills.data=copy.skills.data.map(s=>({...s,category:categories.get(s.id)!}));changes.push({...change,origin:'ai'});continue;
    }
    if(change.area!=='experience'&&change.area!=='projects') throw new TailorError('invalid','Unexpected review change.');
    const section=copy[change.area];
    if(change.textField==='description'){
      const entry=copy.experience.data.find(e=>e.id===change.entryId);
      if(change.area!=='experience'||section.isLocked||!entry)throw new TailorError('invalid','The selected role overview is unavailable or locked.');
      entry.description=change.after;changes.push({...change,origin:'ai'});continue;
    }
    const bullet=section.data.find(e=>e.id===change.entryId)?.bullets.find(b=>b.id===change.bulletId);
    if(section.isLocked || !bullet) throw new TailorError('invalid','The selected achievement is not available.');
    bullet.text=change.after;bullet.isVerified=false;changes.push({...change,origin:'ai'});
  }
  for(const change of selected.filter(c=>c.area==='bullet_order')) {
    const sectionName=source.experience.data.some(e=>e.id===change.entryId)?'experience':'projects';
    const section=copy[sectionName];const entry=section.data.find(e=>e.id===change.entryId);
    const target=result.copy[sectionName].data.find(e=>e.id===change.entryId);
    if(section.isLocked||!entry||!target) throw new TailorError('invalid','The selected order is not available.');
    const before=entry.bullets.map(b=>b.text).join('\n');
    entry.bullets=target.bullets.map(b=>entry.bullets.find(existing=>existing.id===b.id)!);
    if(entry.bullets.some(b=>!b)) throw new TailorError('invalid','An order would remove existing achievements.');
    changes.push({...change,before,after:entry.bullets.map(b=>b.text).join('\n'),origin:'ai'});
  }
  const appliedAi=result.changes.filter((c,i)=>c.area==='summary'?selection.summary==='generated':selection.selectedChanges.includes(i));
  return {copy,changes,summaryEvidence,review:{...result.review,
    appliedWording:changes.filter(c=>c.origin!=='source_based'&&['summary','experience','projects'].includes(c.area)).length,
    skillsGrouped:changes.some(c=>c.area==='skill_groups'),skillsReordered:changes.some(c=>c.area==='skills'),achievementOrders:changes.filter(c=>c.area==='bullet_order').length,
    sourceBasedSummary:selection.summary==='source_based',declinedGrouping:result.changes.some(c=>c.area==='skill_groups')&&!appliedAi.some(c=>c.area==='skill_groups'),declinedChanges:result.changes.filter(c=>c.area!=='skill_groups').length-appliedAi.filter(c=>c.area!=='skill_groups').length,reviewedAt:new Date().toISOString(),
  }};
}

// Preserve Batch22 readable area enums on disk. New clients distinguish the
// category operation with optional metadata; old clients still load the CV.
export function persistedTailorChanges(changes:TailorChange[]){return changes.map(c=>({...c,area:c.area==='skill_groups'?'skills' as const:c.area,...(c.area==='skill_groups'?{skillOperation:'grouping' as const}:{})}));}
