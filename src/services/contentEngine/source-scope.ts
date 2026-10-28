import type {Source} from './engine';
// Exact source spans, not model-authored constraints or a semantic truth classifier.
export type ScopeTail={sourceId:string,entryId:string,start:number,end:number,joiner:string,text:string,kind:'explicit_negative_tail'|'measurement_scope_tail'};
export type ScopeAction={path:string,sourceId:string,text:string,kind:ScopeTail['kind']};
const negative=/(?:\b(?:no|not|never|without)\b|\b\w+n['’]t\b|(?:^|\s)(?:لم|لن|ليس|ليست|لست|لسنا|دون|بدون)(?=\s|$))/iu;
export function sourceScopeTails(s:Source):ScopeTail[]{
 const out:ScopeTail[]=[];
 for(const e of [...s.experience,...s.projects])for(const id of [e.overviewId,...e.bulletIds].filter(Boolean)){
  const f=s.evidence.find(f=>f.id===id);if(!f)continue;
  const cuts=[...f.text.matchAll(/;\s*|؛\s*|(?<=[.!?؟])\s+(?=\S)/gu)].map(m=>({start:m.index!+m[0].length,joiner:m[0].includes('؛')?'؛ ':m[0].includes(';')?'; ':'. '}));
  const cut=cuts.find(c=>negative.test(f.text.slice(c.start)));
  if(cut){const text=f.text.slice(cut.start).trimEnd();out.push({sourceId:id,entryId:e.id,start:cut.start,end:cut.start+text.length,joiner:cut.joiner,text,kind:'explicit_negative_tail'});continue;}
  const measured=/,\s*((?:measured|tested|benchmarked|evaluated)\b[^.!?؛;]*\b(?:staging|sandbox|local|test)\b[^.!?؛;]*[.!?]?)\s*$/iu.exec(f.text);
  if(measured){const text=measured[1].trim();out.push({sourceId:id,entryId:e.id,start:f.text.lastIndexOf(text),end:f.text.lastIndexOf(text)+text.length,joiner:', ',text,kind:'measurement_scope_tail'});}
 }
 return out;
}
// All original entry passages remain available as non-citable context even if omitted.
// Selected IDs alone authorize new prose. A scope-context ID never enlarges that set.
export function scopeContext(s:Source){return [...s.experience,...s.projects].map(e=>({entryId:e.id,origin:s.experience.some(x=>x.id===e.id)?'work':'project',role:'constraints_only_not_additional_claim_evidence',originalPassages:[e.overviewId,...e.bulletIds].filter(Boolean).map(id=>({id,text:s.evidence.find(f=>f.id===id)!.text}))}));}
const identity=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
export function retainScopeTails(part:{text:string,sourceIds:string[]},tails:ScopeTail[],path:string,actions:ScopeAction[]){
 const result={text:part.text,sourceIds:[...part.sourceIds]};if(!result.text)return result;
 for(const t of tails.filter(t=>result.sourceIds.includes(t.sourceId))){
  if(identity(result.text).includes(identity(t.text)))continue;
  const join=t.joiner;
  result.text=result.text.trim().replace(/[.!?؛;,:،؟]+$/u,'')+join+t.text;
  actions.push({path,sourceId:t.sourceId,text:t.text,kind:t.kind});
 }
 return result;
}
export function scopeWarnings(s:Source,d:{summary:{text:string,sourceIds:string[]}}){
 const warnings:{code:string,path:string,message:string}[]=[];
 // A summary need not repeat every detail. Missing literal tails trigger review, not rejection.
 for(const t of sourceScopeTails(s))if(d.summary.sourceIds.includes(t.sourceId)&&!identity(d.summary.text).includes(identity(t.text)))warnings.push({code:'summary_scope_review',path:'summary',message:`Summary cites ${t.sourceId}, which has an explicit source limit. Review its meaning; concise omission is not automatically a contradiction.`});
 return warnings;
}
