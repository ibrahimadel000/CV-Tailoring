// Fictional cases only. These test local behavior, not real model writing quality.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {createCompositionRunner}=load('services/resumeComposer/workflow');
function setup(){
 const p=fixture();p.experience.data[0].bullets=[{id:crypto.randomUUID(),text:'Was responsible for the organization of weekly team meetings for coordinating project updates.',isVerified:true}];
 p.skills.data=['Project Management','Technical Documentation','Agile / Scrum','Project Management Software','Listening'].map(name=>({id:crypto.randomUUID(),name,category:'Soft',level:''}));
 p.skills.data[0].level='Coursework only';
 const source=n.prepareNaturalComposition(p,job).source;
 const entries=source.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:[{text:'Organized weekly team meetings to coordinate project updates.',sourceIds:[e.bulletIds[0]]}]}));
 return {p,r:{summarySegments:[],alternativeSummarySegments:[],entries,skillSelections:source.skillIds.map(id=>({id,category:'Soft'}))}};
}
test('fictional direct rewrite is accepted without changing source or adding employer tools',async()=>{
 const {p,r}=setup(),before=JSON.stringify(p);let active=p,calls=0;
 const runner=createCompositionRunner({readActive:()=>active,appendIfCurrent:(snap,copy)=>{assert.equal(snap,before);active=copy;return true}},async()=>{calls++;return r});
 const out=await runner.run(job,new AbortController().signal);assert.equal(out.status,'created');assert.equal(calls,1);assert.equal(JSON.stringify(p),before);
 assert.equal(active.experience.data[0].bullets[0].text,'Organized weekly team meetings to coordinate project updates.');assert.equal(active.compositionChanges.experience,'edited');assert.equal(active.summary.data,p.summary.data);
 assert.equal(out.semanticStatus,'unassessed');
});
test('only exact known professional methods misclassified as Soft are regrouped and disclosed',()=>{
 const {p,r}=setup(),before=JSON.stringify(p);const out=n.compileNaturalComposition(p,r,job);const byName=new Map(out.candidate.skills.data.map(s=>[s.name,s.category]));
 for(const name of ['Project Management','Technical Documentation','Agile / Scrum'])assert.equal(byName.get(name),'Technical');
 for(const name of ['Project Management Software','Listening'])assert.equal(byName.get(name),'Soft');
 assert.equal(out.candidate.skills.data.find(s=>s.name==='Project Management').level,'Coursework only');
 assert.equal(out.warnings.filter(w=>/Grouped your existing skill/.test(w.message)).length,3);assert.equal(JSON.stringify(p),before);
});
test('locked skills remain unchanged and do not receive category corrections',()=>{
 const {p,r}=setup();p.skills.isLocked=true;r.skillSelections=[];const out=n.compileNaturalComposition(p,r,job);assert.deepEqual(out.candidate.skills,p.skills);assert(!out.warnings.some(w=>/Grouped your existing skill/.test(w.message)));
});
test('editorial instructions demand useful faithful editing, not fabricated details or forced rewrites',()=>{
 for(const x of ['Consider each unlocked contribution','Do not default to copying all passages','never invent tools, outcomes or employer experience','not a template or a reason to force rewrites']) assert(n.naturalInstructions.includes(x));
});
