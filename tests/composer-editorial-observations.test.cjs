const {test}=require('node:test'),assert=require('node:assert/strict');
const {editorialObservations}=require('../benchmarks/resume-composer/editorial-checks.cjs');
const {load}=require('./helpers/editorial-loader.cjs');const {fixture,response}=require('./helpers/composer-editorial-v4-fixture.cjs');
const {compileEditorialComposition,editorialInstructions}=load('services/resumeComposer/editorialDocument');
test('structurally accepted copied summary is observable, not auto-rejected',()=>{
 const p=fixture(),raw=response(p);raw.summaryClaims=[{kind:'experience',text:p.experience.data[0].bullets[0].text,sourceIds:['work_1_b1']}];
 const candidate=compileEditorialComposition(p,raw).candidate,before=JSON.stringify(candidate),report=editorialObservations(candidate);
 assert(report.findings.some(x=>x.code==='summary_repeats_entry_sentence'));assert.equal(JSON.stringify(candidate),before);assert(!('qualityStatus'in report));
});
test('concise distinct summary has no exact-repetition findings, not a semantic pass',()=>{
 const p=fixture();p.summary.data='Software engineer focused on web applications and technical collaboration.';
 const report=editorialObservations(p);assert.deepEqual(report.findings,[]);assert(report.unassessed.includes('semantic_faithfulness'));assert(!('score'in report));
});
test('unchanged good work bullet is not penalized merely because it was not rewritten',()=>{
 const p=fixture();p.summary.data='A distinct introduction.';assert.deepEqual(editorialObservations(p).findings,[]);
});
test('full repeated summary sentences retain exact quotes and paths for review',()=>{
 const p=fixture();p.summary.data='Clear technical communication. Clear technical communication.';
 const r=editorialObservations(p);assert.equal(r.findings[0].code,'summary_repeats_its_sentence');assert.equal(r.findings[0].quote,'Clear technical communication.');assert.equal(r.findings[0].earlierPath,'summary.sentences.0');
});
test('whitespace changes do not hide a copied complete sentence',()=>{
 const p=fixture();p.summary.data=p.experience.data[0].bullets[0].text.replaceAll(' ','  ');assert(editorialObservations(p).findings.some(x=>x.code==='summary_repeats_entry_sentence'));
});
test('numbers and qualifiers are not stripped to force a match',()=>{
 const p=fixture();p.experience.data[0].bullets[0].text='Reduced response time by 20% in staging.';p.summary.data='Reduced response time by 90% in production.';
 const r=editorialObservations(p);assert.deepEqual(r.findings,[]);assert(r.unassessed.includes('semantic_faithfulness'));
});
test('document identity changes with the output, avoiding stale observations',()=>{
 const p=fixture(),a=editorialObservations(p);p.summary.data+=' Changed.';assert.notEqual(a.documentHash,editorialObservations(p).documentHash);
});
test('editorial prompt requires synthesis and target priorities, without rewrite quota',()=>{
 for(const text of ['summary is an introduction, not a compressed copy','Do not repeat complete achievement sentences','Preserve an already strong original bullet','most important target responsibilities'])assert(editorialInstructions.includes(text));
});
