import type { CVProfile } from '@/types/schema';
import { compositionIssue, type applyTailorPatch } from '@/services/tailorModel';
import type { DraftOverview, DraftOrder } from '@/services/composer/draft';
// Deterministic application to a detached copy. Qualification labels never
// authorize writing or ordering. These checks do NOT establish entailment.
export function applyDraftAdditions(source:CVProfile,result:ReturnType<typeof applyTailorPatch>,overviews:DraftOverview[]=[],orders:DraftOrder[]=[]){
  for(const row of overviews){
    const original=source.experience.data.find(e=>e.id===row.entryId),entry=result.copy.experience.data.find(e=>e.id===row.entryId);
    if(!original||!entry)continue;
    if(row.text===(original.description??''))continue;
    const issue=source.experience.isLocked?'The experience section is locked.':!original.description?.trim()?'A new role overview cannot be invented in this version.':!row.text.trim()?'An existing role overview cannot be removed.':compositionIssue(original.description,row.text,[{id:entry.id,label:'Work role',text:[original.description,original.roleTitle,original.companyName].join(' ')}]);
    result.review.proposedWording++;
    if(issue){result.review.rejected.push({area:'experience',before:original.description??'',proposed:row.text,reason:issue});result.review.rejectedWording++;continue;}
    result.changes.push({area:'experience',entryId:entry.id,before:original.description??'',after:row.text,textField:'description',qualityNote:'Review the rewritten role overview against its source. Local checks are not semantic verification.'});entry.description=row.text;result.review.appliedWording++;
  }
  for(const order of orders){
    const section=result.copy[order.section],entry=section.data.find(e=>e.id===order.entryId);
    if(section.isLocked||!entry)continue;
    if(new Set(order.bulletIds).size!==order.bulletIds.length||order.bulletIds.length!==entry.bullets.length||order.bulletIds.some(id=>!entry.bullets.some(b=>b.id===id))){result.warnings.push('Draft order omitted: it was not a full permutation of the original entry.');continue;}
    if(entry.bullets.map(b=>b.id).join()===order.bulletIds.join())continue;
    const before=entry.bullets.map(b=>b.text).join('\n');entry.bullets=order.bulletIds.map(id=>entry.bullets.find(b=>b.id===id)!);
    result.changes.push({area:'bullet_order',entryId:entry.id,before,after:entry.bullets.map(b=>b.text).join('\n')});result.review.achievementOrders++;
  }
}
