/** Developer benchmark only; NOT a runtime semantic verifier or an ATS score. */
const {createHash}=require('node:crypto');
const {core}=require('./loader.cjs');
const dimensions=['faithfulness','job_focus','document_coherence','content_selection','language_quality'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quoteMap=d=>Object.fromEntries([['summary',d.summary.text],...['experience','projects'].flatMap(section=>d[section].flatMap((e,i)=>[[`${section}.${i}.overview`,e.overview.text],...e.bullets.map((b,j)=>[`${section}.${i}.bullets.${j}`,b.text])]))]);
function packetFor(c){return core.prepareSourceComposition(c.input.source,c.input.job);}
function identities(c,raw){return{inputHash:hash({system:core.compositionInstructions,packet:packetFor(c)}),outputHash:hash(raw)}}
function pending(ids){return{...ids,status:'pending',reviewer:null,dimensions:dimensions.map(id=>({id,verdict:'unassessed',note:''})),findings:[]}}
function validateReview(c,draft,raw,record){
 const ids=identities(c,raw),issue=message=>{throw Error('Invalid review: '+message)};
 if(!record||record.inputHash!==ids.inputHash||record.outputHash!==ids.outputHash)issue('Review hashes do not match this exact input and output.');
 if(!record.reviewer||!['human_review','assisted_review','prepared_test'].includes(record.reviewer.type)||typeof record.reviewer.label!=='string'||!record.reviewer.label.trim()||record.reviewer.label.length>120)issue('Reviewer origin and bounded label are required.');
 if(!Array.isArray(record.dimensions)||record.dimensions.length!==dimensions.length||new Set(record.dimensions.map(d=>d.id)).size!==dimensions.length)issue('All five unique dimensions are required.');
 for(const d of record.dimensions)if(!dimensions.includes(d.id)||!['pass','needs_revision','fail','unassessed'].includes(d.verdict)||typeof d.note!=='string'||d.note.length>2000||(d.verdict!=='unassessed'&&d.note.trim().length<10))issue('Each assessed dimension requires an explicit judgment and explanation.');
 if(!Array.isArray(record.findings)||record.findings.length>100)issue('Findings must be bounded.');
 const outputs=quoteMap(draft),facts=new Map(c.input.source.evidence.map(f=>[f.id,f.text]));
 for(const f of record.findings){
  if(!['critical','major','minor'].includes(f.severity)||!['factual','loss','editorial'].includes(f.kind)||typeof f.explanation!=='string'||f.explanation.trim().length<10||f.explanation.length>2000)issue('Finding severity, kind and explanation are required.');
  if(!Object.hasOwn(outputs,f.path))issue('Unknown output path.');
  if(typeof f.outputQuote!=='string'||f.outputQuote.length>2400||(!f.outputQuote&&f.kind!=='loss')||(f.outputQuote&&!outputs[f.path].includes(f.outputQuote)))issue('Output quote must match the output at its path.');
  if(!Array.isArray(f.sourceAnchors)||f.sourceAnchors.length>24||((f.kind==='factual'||f.kind==='loss')&&!f.sourceAnchors.length))issue('Factual/loss findings require source anchors.');
  for(const a of f.sourceAnchors)if(typeof a.quote!=='string'||!a.quote||a.quote.length>12000||!facts.get(a.sourceId)?.includes(a.quote))issue('Source quote must exist in the cited original.');
 }
 // Human/assisted judgments remain attributed judgments, not truth guaranteed by this function.
 const status=record.reviewer.type==='prepared_test'?'fixture_only':record.findings.some(f=>f.severity==='critical')?'blocked':record.findings.some(f=>f.severity==='major')||record.dimensions.some(d=>['fail','needs_revision'].includes(d.verdict))?'needs_revision':record.dimensions.some(d=>d.verdict==='unassessed')?'pending':'reviewed_pass';
 return{...ids,status,reviewer:record.reviewer,dimensions:record.dimensions,findings:record.findings};
}
function evaluate(c,raw,review){
 const ids=identities(c,raw);let compiled;
 try{compiled=core.compileDocument(c.input.source,raw)}catch(error){return{caseId:c.id,inputOrigin:c.origin,...ids,technical:{status:'rejected',message:String(error.message).slice(0,3000)},quality:{status:'not_evaluated'},warning:'A technical rejection is not a semantic judgment.'};}
 const quality=review?validateReview(c,compiled.draft,raw,review):pending(ids);
 return{caseId:c.id,inputOrigin:c.origin,...ids,technical:{status:'accepted',advisoryWarnings:compiled.warnings,omittedSourceIds:compiled.omittedSourceIds,normalizations:compiled.normalizations},quality,warning:'Structural acceptance, source IDs, quotes, and input/output hashes do not establish semantic correctness. No automated quality verdict was made.'};
}
function unchanged(c){const s=c.input.source,map=new Map(s.evidence.map(f=>[f.id,f.text]));return{summary:s.locks.summary?{text:'',sourceIds:[]}:{text:map.get(s.summaryId)||'',sourceIds:s.summaryId?[s.summaryId]:[]},entries:[...s.experience.filter(()=>!s.locks.experience),...s.projects.filter(()=>!s.locks.projects)].map(e=>({id:e.id,overview:{text:e.overviewId?map.get(e.overviewId):'',sourceIds:e.overviewId?[e.overviewId]:[]},bullets:e.bulletIds.map(id=>({text:map.get(id),sourceIds:[id]}))})),skillIds:s.locks.skills?[]:[...s.skillIds]};}
module.exports={dimensions,hash,packetFor,identities,evaluate,unchanged};
