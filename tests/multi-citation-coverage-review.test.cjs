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
 assert(out.guardNotes.some(x=>x.path==='entries.work_1'&&x.kind==='review'&&x.message.includes('combines multiple source passages')));
});
test('ordinary single-source copy does not receive the multi-citation notice',()=>{
 const {out}=compile(f=>({text:f.get('work_1_b1'),sourceIds:['work_1_b1']}));
 assert(!out.guardNotes.some(x=>x.message.includes('combines multiple source passages')));
});
test('combined rewritten passages receive a review without forced restoration',()=>{
 const {out,texts}=compile(()=>({text:'Built web applications and improved delivery workflows.',sourceIds:['work_1_b1','work_1_b2']}));
 assert.equal(texts[0],'Built web applications and improved delivery workflows.');
 assert(out.guardNotes.some(x=>x.message.includes('combines multiple source passages')));
});
test('flags even when another surviving line separately cites the other source',()=>{
 const {out}=compile(f=>({text:f.get('work_1_b1'),sourceIds:['work_1_b1','work_1_b2']}), f=>[{text:f.get('work_1_b2'),sourceIds:['work_1_b2']}]);
 assert(out.guardNotes.some(x=>x.message.includes('combines multiple source passages')));
});
test('does not flag a proposed line replaced by overlapping restoration',()=>{
 const {p,out,texts}=compile(f=>({text:f.get('work_1_b1'),sourceIds:['work_1_b1','work_1_b2']}), ()=>[{text:'Improved delivery workflows using Kubernetes.',sourceIds:['work_1_b2']}]);
 assert.deepEqual(texts,p.experience.data[0].bullets.map(x=>x.text));
 assert(out.guardNotes.some(x=>x.message.includes('overlap')));
 assert(!out.guardNotes.some(x=>x.message.includes('combines multiple source passages')));
});
test('overview with two source passages and identity metadata receives review',()=>{
 const p=fixture();p.experience.data[0].description='Supported delivery of web applications.';
 const s=n.prepareNaturalComposition(p,job).source, f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const e=s.experience[0], raw={summarySegments:[],entries:[{id:e.id,overview:{text:'Supported web applications and delivery workflows.',sourceIds:[e.overviewId,'work_1_b2','entrymeta:work_1:title']},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))}],skillSelections:[]};
 const out=n.compileNaturalComposition(p,raw,job);
 assert.equal(out.candidate.experience.data[0].description,raw.entries[0].overview.text);
 assert(out.guardNotes.some(x=>x.message.includes('combines multiple source passages')));
});
test('surviving multi-source summary prompts comparison without proving coverage',()=>{
 const p=fixture(),s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const raw={summarySegments:[{text:'Experience building web applications and improving delivery workflows.',sourceIds:['work_1_b1','work_1_b2']}],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))})),skillSelections:[]};
 const out=n.compileNaturalComposition(p,raw,job);
 assert.equal(out.candidate.summary.data,raw.summarySegments[0].text);
 assert(out.warnings.some(x=>x.message.includes('summary sentence cites multiple source passages')));
});
test('identity plus one narrative is not described as multiple source passages',()=>{
 const p=fixture(),s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const raw={summarySegments:[{text:'Software engineer with experience building web applications.',sourceIds:['headline','work_1_b1']}],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))})),skillSelections:[]};
 const out=n.compileNaturalComposition(p,raw,job);
 assert.equal(out.candidate.summary.data,raw.summarySegments[0].text);
 assert(!out.warnings.some(x=>x.message.includes('summary sentence cites multiple source passages')));
});
