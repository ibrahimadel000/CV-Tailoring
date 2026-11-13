'use strict';
const {test}=require('node:test'),a=require('node:assert/strict');
const {cases,run}=require('../scripts/relationship-risk-probes.cjs');
test('relationship probes are paired across professions and languages without provider calls',()=>{
 a.equal(cases.length,12);a.equal(new Set(cases.map(x=>x.id)).size,cases.length);a(new Set(cases.map(x=>x.profession)).size>=9);a(cases.some(x=>x.language==='ar'));
 const originalFetch=globalThis.fetch;let results;try{globalThis.fetch=()=>{throw Error('Unexpected network call');};results=run();}finally{globalThis.fetch=originalFetch;}a.equal(results.length,cases.length*2);
 for(const c of cases){const pair=results.filter(x=>x.id===c.id);a.deepEqual(pair.map(x=>x.variant),['faithful','risky']);for(const r of pair){a.equal(r.source,c.source);a.equal(r.semanticStatus,'unassessed');a(Array.isArray(r.retained));a(Array.isArray(r.notes));}}
});
