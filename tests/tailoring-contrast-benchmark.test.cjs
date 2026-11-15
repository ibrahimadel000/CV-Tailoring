'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const savedFetch=globalThis.fetch;
let benchmark;
try { globalThis.fetch=()=>{throw Error('Unexpected fetch');}; benchmark=require('../scripts/tailoring-contrast-benchmark.cjs'); }
finally { globalThis.fetch=savedFetch; }
const {cases,run,report,verbExceptionExperiment}=benchmark;
function withoutFetch(fn){const old=globalThis.fetch;try{globalThis.fetch=()=>{throw Error('Unexpected fetch');};return fn();}finally{globalThis.fetch=old;}}
test('fictional benchmark reports paired classified outcomes and actual evidence mapping',()=>{
 assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
 assert(cases.length>=15); assert(new Set(cases.map(c=>c.occupation)).size>=8);
 assert(cases.filter(c=>c.language==='ar').length>=2);
 const results=withoutFetch(run);
 assert.equal(results.length,cases.length*2);
 for(const c of cases){
  const pair=results.filter(r=>r.id===c.id);
  assert.deepEqual(pair.map(r=>r.variant),['faithful','contrast']);
  for(const r of pair){
   assert.deepEqual(r.source,c.source);assert.equal(r.proposed,c[r.variant]);
   assert.deepEqual(r.citations.map(x=>x.sourceIndex),c.citations||[0]);
   for(const citation of r.citations){assert.equal(citation.sourceText,c.source[citation.sourceIndex]);assert.equal(citation.sourceId,`work_1_b${citation.sourceIndex+1}`);}
   assert.equal(r.semanticStatus,'unassessed');assert.equal(r.exactProposalRetained,r.retained.includes(r.proposed));assert(Array.isArray(r.guardNotes));assert(Array.isArray(r.warnings));
  }
  assert.equal(pair[0].classification,c.faithfulClass||'supported-paraphrase');
  assert.equal(pair[1].classification,c.contrastClass||'unsupported-claim');
 }
 assert.equal(results.find(r=>r.id==='sql-product'&&r.variant==='contrast').classification,'ambiguous');
 assert.equal(results.find(r=>r.id==='multi-omission'&&r.variant==='contrast').classification,'omission');
 assert.equal(results.find(r=>r.id==='range-reversal'&&r.variant==='faithful').classification,'unchanged-control');
 assert.equal(results.find(r=>r.id==='multi-omission'&&r.variant==='faithful').proposed,'Prepared patient appointment lists; recorded appointment changes for the nursing team.');
});
test('term-only counterfactual includes the prepared-statement hard negative',()=>{
 const rows=withoutFetch(verbExceptionExperiment);
 assert.deepEqual(rows.map(r=>r.id),['sql-verb','sql-product','sql-statements']);
 assert.deepEqual(rows.map(r=>r.classification),['supported-paraphrase','ambiguous','unsupported-technique']);
 for(const r of rows){assert(Array.isArray(r.currentUnsupported));assert(Array.isArray(r.withPreparedException));}
});
test('checked-in report matches current measured output and source fingerprint',()=>{
 // A change requires explicit regeneration and review; it is not a safety verdict.
 const snapshot=require('../benchmarks/tailoring-contrast-results.json');
 assert.deepEqual(withoutFetch(report),snapshot);
});
