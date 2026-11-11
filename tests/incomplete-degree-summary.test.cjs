// Fictional examples; this narrow guard cannot determine education status generally.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
function rig(degree,description='') {
 const p=fixture();p.summary.data='Original introduction.';p.experience.data=[];p.projects.data=[];p.skills.data=[];p.certifications.data=[];
 Object.assign(p.education.data[0],{degree,institution:'Fictional University',startDate:'',endDate:'',graduationDate:'',description,gpa:'',honors:[]});
 p.education.data=p.education.data.slice(0,1);
 const before=JSON.stringify(p),s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const raw={summarySegments:[],entries:[...s.experience,...s.projects].map(e=>({id:e.id,overview:e.overviewId?{text:f.get(e.overviewId),sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))})),skillSelections:[]};
 return {p,before,raw};
}
for(const [degree,proposed] of [
 ['Bachelor degree in progress','Earned a bachelor degree.'],
 ["Bachelor's degree (in progress)","Holds a bachelor's degree."],
 ['Master degree (ongoing)','Completed a master degree.'],
 ['Bachelor degree (currently pursuing)','Graduated with a bachelor degree.'],
 ['Bachelor degree (not yet completed)','Bachelor degree completed.'],
]) test('in-progress degree cannot silently become explicit completion: '+degree,()=>{
 const {p,before,raw}=rig(degree);raw.summarySegments=[{text:proposed,sourceIds:['education_1']}];
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.summary.data,p.summary.data);
 a(out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.kind==='removed'&&x.message.includes('degree')));
 a.deepEqual(out.candidate.education,p.education);a.equal(JSON.stringify(p),before);
});
for(const [degree,proposed] of [
 ['Bachelor degree in progress','Pursuing a bachelor degree.'],
 ['Bachelor degree in progress','Bachelor degree in progress.'],
 ['Bachelor degree in progress','Completed coursework while pursuing a bachelor degree.'],
]) test('ongoing degree and completed coursework remain eligible: '+proposed,()=>{
 const {p,raw}=rig(degree,proposed.startsWith('Completed coursework')?'Completed coursework.':'');raw.summarySegments=[{text:proposed,sourceIds:['education_1']}];
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.summary.data,proposed);
});
test('a completed degree is not treated as in-progress',()=>{
 const {p,raw}=rig('Bachelor degree','Graduated with a bachelor degree.');raw.summarySegments=[{text:'Graduated with a bachelor degree.',sourceIds:['education_1']}];
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.summary.data,'Graduated with a bachelor degree.');
});
test('multiple cited education records are not automatically adjudicated',()=>{
 const {p,raw}=rig('Master degree in progress');p.education.data.push({...p.education.data[0],id:crypto.randomUUID(),degree:'Bachelor degree',description:''});
 raw.summarySegments=[{text:'Earned a bachelor degree and pursuing a master degree.',sourceIds:['education_1','education_2']}];
 const out=n.compileNaturalComposition(p,raw,job);
 a(!out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.message.includes('degree')));
});
test('a progress marker for coursework alone does not prove the degree is unfinished',()=>{
 const {p,raw}=rig('Bachelor degree','Further coursework in progress.');raw.summarySegments=[{text:'Earned a bachelor degree.',sourceIds:['education_1']}];
 const out=n.compileNaturalComposition(p,raw,job);a(!out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.message.includes('degree')));
});
test('a separate valid summary survives an unsupported graduation claim',()=>{
 const {p,raw}=rig('Bachelor degree in progress');
 raw.summarySegments=[{text:'Earned a bachelor degree.',sourceIds:['education_1']},{text:'Pursuing a bachelor degree.',sourceIds:['education_1']}];
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.summary.data,'Pursuing a bachelor degree.');
 a(out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.message.includes('degree')));
});
test('the exact original summary is not rewritten even when it cites ongoing study',()=>{
 const {p,raw}=rig('Bachelor degree in progress');p.summary.data='Earned a bachelor degree.';
 raw.summarySegments=[{text:p.summary.data,sourceIds:['summary','education_1']}];
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.summary.data,p.summary.data);
 a(!out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.message.includes('degree')));
});
test('locked summary and education remain intact',()=>{
 const {p,raw}=rig('Bachelor degree in progress');p.summary.isLocked=true;
 raw.summarySegments=[{text:'Earned a bachelor degree.',sourceIds:['education_1']}];
 const out=n.compileNaturalComposition(p,raw,job);a.deepEqual(out.candidate.summary,p.summary);a.deepEqual(out.candidate.education,p.education);
});
test('a completed credential explicitly cited alongside an ongoing one is not adjudicated',()=>{
 const {incompleteDegreeConflict}=load('services/resumeComposer/degreeStatus');
 a.equal(incompleteDegreeConflict('Earned a bachelor degree and pursuing a master degree.',[
  {kind:'education',text:'Master degree in progress · Previously earned a bachelor degree.'}
 ]),false);
 a.equal(incompleteDegreeConflict('Earned a bachelor degree.',[
  {kind:'education',text:'Bachelor degree in progress'},{kind:'certification',text:'Bachelor degree'}
 ]),false);
});
test('negative completion wording and coursework do not match positive completion',()=>{
 const {incompleteDegreeConflict}=load('services/resumeComposer/degreeStatus');
 for(const text of ["Has not yet completed a bachelor degree.","Didn't earn a bachelor degree.",'Completed coursework while pursuing a bachelor degree.'])
  a.equal(incompleteDegreeConflict(text,[{kind:'education',text:'Bachelor degree in progress'}]),false,text);
});
test('incomplete status and completion wording beyond the literal patterns stay unverified',()=>{
 const {incompleteDegreeConflict}=load('services/resumeComposer/degreeStatus');
 a.equal(incompleteDegreeConflict('Holds a bachelor degree.',[{kind:'education',text:'Bachelor degree · Expected 2028'}]),false);
 a.equal(incompleteDegreeConflict('Has a bachelor degree.',[{kind:'education',text:'Bachelor degree in progress'}]),false);
});
