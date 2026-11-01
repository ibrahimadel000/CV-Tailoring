// Native, offline regression tests. Provenance is NOT entailment or writing quality.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
function written(p,segments){const s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(f=>[f.id,f]));return {summarySegments:segments,entries:s.experience.filter(()=>!s.locks.experience).map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id).text,sourceIds:[id]}))})),skillSelections:s.locks.skills?[]:[{id:'skill_1',category:'Languages'}]};}
const unit=(text,sourceIds)=>({text,sourceIds});
test('writer receives actual professional facts ahead of separate inherited profile context',()=>{
 const p=fixture(),before=JSON.stringify(p),packet=n.prepareNaturalComposition(p,job),brief=packet.documentBrief.summaryEvidence;
 a.deepEqual(Object.keys(packet).slice(0,3),['revision','job','documentBrief']);
 a.deepEqual(brief.primaryFacts.map(f=>f.id),['work_1_b1','work_1_b2','work_1_b3']);
 a(brief.primaryFacts.every(f=>f.parent==='work_1'));a(brief.profileContext.some(f=>f.id==='summary'));
 for(const f of brief.primaryFacts)a.deepEqual(f,((({id,kind,parent,text})=>({id,kind,parent,text}))(packet.source.evidence.find(x=>x.id===f.id))));
 a(!brief.primaryFacts.some(f=>f.kind==='skill'));a.equal(JSON.stringify(p),before);
});
test('tampering with an authoring-view fact is rejected by actual provider schema binding',()=>{
 const packet=n.prepareNaturalComposition(fixture(),job);packet.documentBrief.summaryEvidence.primaryFacts[0].text='Invented production API work';a.throws(()=>n.googleNaturalSchema(packet),/contract mismatch/);
});
test('a compact work-based introduction remains accepted without adding a capability inventory',()=>{
 const p=fixture(),text='Software engineer combining web application development with delivery workflow improvement.';
 const out=n.compileNaturalComposition(p,written(p,[unit(text,['work_1_b1','work_1_b2'])]));a.equal(out.candidate.summary.data,text);a.deepEqual(out.summaryCapabilityIds,[]);a.equal(out.semanticStatus,'unassessed');
});
test('a removed narrative passage cannot rescue a retained profile-only introduction',()=>{
 const p=fixture();p.summary.data='I work at the intersection of technology and management. I collaborate across teams.';
 const r=written(p,[unit('I work at the intersection of technology and management.',['summary']),unit('Expert building production RESTful APIs using Python.',['work_1_b1','skill_1','skill_2'])]);
 a.throws(()=>n.compileNaturalComposition(p,r),/only profile or identity context/);
});
test('qualification-led introduction preserves in-progress scope without pretending it is work',()=>{
 const p=fixture();p.education.data[0].degree='B.Sc. Computer Science (in progress)';
 const text='Computer science studies in progress.';
 const out=n.compileNaturalComposition(p,written(p,[unit(text,['education_1'])]));a.equal(out.candidate.summary.data,text);a.deepEqual(out.candidate.education,p.education);
});
test('explicit personal direction can supplement a supported professional introduction',()=>{
 const p=fixture();p.summary.data='Interested in accessible web interfaces.';
 const out=n.compileNaturalComposition(p,written(p,[unit('Background in web application development.',['work_1_b1']),unit(p.summary.data,['summary'])]));a(out.candidate.summary.data.endsWith(p.summary.data));
});
test('context-only sparse sources are not forced to invent a work anchor',()=>{
 const p=fixture();p.experience.data=[];p.projects.data=[];p.education.data=[];p.certifications.data=[];p.summary.data='Interested in accessible web interfaces.';
 a.equal(n.prepareNaturalComposition(p,job).documentBrief.summaryEvidence.primaryFacts.length,0);
 a.equal(n.compileNaturalComposition(p,written(p,[unit(p.summary.data,['summary'])])).candidate.summary.data,p.summary.data);
});
test('locked work remains usable as evidence without editing it; locked summary has no authoring facts',()=>{
 const p=fixture();p.experience.isLocked=true;const text='Background in web application development.';
 const out=n.compileNaturalComposition(p,written(p,[unit(text,['work_1_b1'])]));a.equal(out.candidate.summary.data,text);a.deepEqual(out.candidate.experience,p.experience);
 p.summary.isLocked=true;const b=n.prepareNaturalComposition(p,job).documentBrief.summaryEvidence;a.deepEqual(b.primaryFacts,[]);a.deepEqual(b.profileContext,[]);
});
test('valid IDs can still support bad writing: the repair does not pretend to certify meaning',()=>{
 const p=fixture(),r=written(p,[unit('A versatile professional delivering meaningful results.',['work_1_b1'])]);
 const out=n.compileNaturalComposition(p,r);a.equal(out.semanticStatus,'unassessed');a.equal(out.candidate.summary.data,r.summarySegments[0].text);
 // This deliberately exposes the remaining limitation; it is NOT writing acceptance.
});

test('unchanged original summary remains permitted without falsely certifying it as good writing',()=>{
 const p=fixture();p.summary.data='An original candidate statement.';
 const out=n.compileNaturalComposition(p,written(p,[unit(p.summary.data,['summary'])]));a.equal(out.candidate.summary.data,p.summary.data);a.equal(out.semanticStatus,'unassessed');
});
