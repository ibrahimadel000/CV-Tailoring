// Fictional offline regression: exact language labels only, not a fit classifier.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const c=load('services/resumeComposer/explicitSkillCoverage');
function setup(names=['C++','C#','F#']) {
 const p=fixture();p.skills.data=names.map(name=>({id:crypto.randomUUID(),name,category:'Languages',level:'Coursework only'}));
 const job='Required: C++ and C# for application development; F# is preferred.';
 const s=n.prepareNaturalComposition(p,job).source;
 return {p,job,s,add:(j,selected=[])=>c.explicitSkillCoverage(p,s,j,selected)};
}
test('exact C++, C#, and F# labels can be retained, with native levels unchanged',()=>{
 const {p,job,s,add}=setup(),before=JSON.stringify(p),f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const raw={summarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))})),skillSelections:[]};
 a.deepEqual(add(job).map(x=>x.name),['C++','C#','F#']);
 const out=n.compileNaturalComposition(p,raw,job);
 a.deepEqual(out.candidate.skills.data,p.skills.data); a.deepEqual(out.candidate.experience,p.experience);
 a(out.guardNotes.some(x=>x.path==='skillSelections'&&x.message.includes('literal match'))); a.equal(JSON.stringify(p),before);
});
test('only exact independently named languages count, not fragments or composite labels',()=>{
 const {add}=setup();
 for(const job of ['Experience with C++17, Objective-C++, or C#8 is desired.','Work in C, F or Cplusplus.']) a.deepEqual(add(job),[],job);
 a.deepEqual(add('Application developer working in c++.' ).map(x=>x.name),['C++']);
 const composite=setup(['C++ game development']);a.deepEqual(composite.add('C++ is required.'),[]);
});
test('negated, contradictory, non-English or ambiguous evidence cannot trigger restoration',()=>{
 const {add}=setup();
 for(const job of ['C++ is not required.','No C# required.','C++ is preferred; C++ is not required.','لا نحتاج إلى C++ لهذا المنصب.','C++ is preferred; لا نحتاج إلى C++ لهذا المنصب.']) a.deepEqual(add(job),[],job);
 const amb=setup(['C++','C++']);
 a.equal(amb.add('C++ is required.').length,1,'equivalent duplicate can be represented once');
 const different=setup(['C++','C++']);different.p.skills.data[1].level='Advanced';
 const s=n.prepareNaturalComposition(different.p,'C++ is required for application development and maintenance.').source;
 a.deepEqual(c.explicitSkillCoverage(different.p,s,'C++ is required.',[]),[]);
});
test('locked skills and an already-selected equivalent stay unchanged',()=>{
 const {p,s,add}=setup();a(!add('C++ is required.',[{id:'skill_1',category:'Languages'}]).some(x=>x.name==='C++'));
 p.skills.isLocked=true;const locked=n.prepareNaturalComposition(p,'C++ is required for application development and maintenance.').source;
 a.deepEqual(c.explicitSkillCoverage(p,locked,'C++ is required.',[]),[]);
});
