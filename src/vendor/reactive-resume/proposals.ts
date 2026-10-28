// Adapted from Reactive Resume packages/resume/src/proposals.ts (MIT).
// Commit 44929ad102d382588eea8ed87d943e385fb9cf80. Pure text functions only;
// rich-text/database dependencies intentionally excluded. See third-party/.
export type PassageProposal = { before:string; after:string };
export function canApplyTo(value:string|undefined,{before}:Pick<PassageProposal,'before'>) {
  if(value===undefined)return false;
  if(!before)return value==='';
  const index=value.indexOf(before);
  return index>=0&&value.indexOf(before,index+1)<0;
}
export function applyTo(value:string|undefined,proposal:PassageProposal) {
  if(value===undefined||!canApplyTo(value,proposal))return undefined;
  return value.replace(proposal.before,()=>proposal.after);
}
