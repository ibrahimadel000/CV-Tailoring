// Fictional offline probes: citation coverage is not semantic completeness.
const {test}=require('node:test'), assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
function compile(first, extra=()=>[]) {
 const p=fixture(), before=JSON.stringify(p), s=n.prepareNaturalComposition(p,job).source;
 const f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const bullets=[first(f),...extra(f),{text:f.get('work_1_b3'),sourceIds:['work_1_b3']}];
 const raw={summarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets})),skillSelections:[]};
 const out=n.compileNaturalComposition(p,raw,job);assert.equal(JSON.stringify(p),before);
 return {p,out,texts:out.candidate.experience.data[0].bullets.map(x=>x.text)};
}
test('one original line citing two passages receives a review without changing the copy',()=>{
 const {p,out,texts}=compile(f=>({text:f.get('work_1_b1'),sourceIds:['work_1_b1','work_1_b2']}));
 assert.deepEqual(texts,[p.experience.data[0].bullets[0].text,p.experience.data[0].bullets[2].text]);
 assert(out.guardNotes.some(x=>x.path==='entries.work_1.bullets.0'&&x.kind==='review'&&x.message.includes('one cited passage')));
});
test('ordinary single-source copy does not receive the multi-citation notice',()=>{
 const {out}=compile(f=>({text:f.get('work_1_b1'),sourceIds:['work_1_b1']}));
 assert(!out.guardNotes.some(x=>x.message.includes('one cited passage')));
});
test('combined rewritten passages are not automatically flagged by this exact-match signal',()=>{
 const {out,texts}=compile(()=>({text:'Built web applications and improved delivery workflows.',sourceIds:['work_1_b1','work_1_b2']}));
 assert.equal(texts[0],'Built web applications and improved delivery workflows.');
 assert(!out.guardNotes.some(x=>x.message.includes('one cited passage')));
});
test('does not flag when another surviving line separately cites the other source',()=>{
 const {out}=compile(f=>({text:f.get('work_1_b1'),sourceIds:['work_1_b1','work_1_b2']}), f=>[{text:f.get('work_1_b2'),sourceIds:['work_1_b2']}]);
 assert(!out.guardNotes.some(x=>x.message.includes('one cited passage')));
});
test('does not flag a proposed line replaced by overlapping restoration',()=>{
 const {p,out,texts}=compile(f=>({text:f.get('work_1_b1'),sourceIds:['work_1_b1','work_1_b2']}), ()=>[{text:'Improved delivery workflows using Kubernetes.',sourceIds:['work_1_b2']}]);
 assert.deepEqual(texts,p.experience.data[0].bullets.map(x=>x.text));
 assert(out.guardNotes.some(x=>x.message.includes('overlap')));
 assert(!out.guardNotes.some(x=>x.message.includes('one cited passage')));
});
