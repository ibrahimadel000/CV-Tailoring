// Synthetic cases only. Literal sign/range checks cannot verify a metric's meaning.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {scopeRisk}=load('services/resumeComposer/scopeRisk');
function rig(text,section='experience') {
 const p=fixture();p.experience.data[0].bullets[0].text=text;
 if(section==='projects')p.projects.data=[{id:crypto.randomUUID(),name:'Fictional project',role:'Contributor',bullets:[{id:crypto.randomUUID(),text,isVerified:true}]}];
 const before=JSON.stringify(p),s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const entries=[...s.experience,...s.projects].filter(e=>!(e.id.startsWith('work_')?s.locks.experience:s.locks.projects)).map(e=>({id:e.id,overview:e.overviewId?{text:f.get(e.overviewId),sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))}));
 return {p,before,raw:{summarySegments:[],entries,skillSelections:[]}};
}
for(const [source,proposal] of [
 ['Reported an operating margin of -5%.','Reported an operating margin of 5%.'],
 ['Reported an operating margin of 5%.','Reported an operating margin of -5%.'],
 ['Reported a balance of −1,200.5 dollars.','Reported a balance of 1,200.5 dollars.'],
 ['بلغ هامش التشغيل -٥٪.','بلغ هامش التشغيل ٥٪.'],
 ['Reported a balance of $-5.','Reported a balance of $5.'],
]) test('changed numeric sign restores the original: '+source,()=>{
 const {p,before,raw}=rig(source);raw.entries[0].bullets[0].text=proposal;
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a(out.guardNotes.some(x=>x.kind==='restored'&&x.path==='entries.work_1.bullets.0'&&x.message.includes('sign')));
 a.equal(JSON.stringify(p),before);
});
test('signed endpoints reversed are restored even when both signs are cited',()=>{
 const source='Reported a margin change from -5% to 5%.',proposal='Reported a margin change from 5% to -5%.';
 const {p,raw}=rig(source);raw.entries[0].bullets[0].text=proposal;
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a(out.guardNotes.some(x=>x.path==='entries.work_1.bullets.0'&&x.message.includes('numeric range')));
});
test('Arabic signed range direction is preserved',()=>{
 a(scopeRisk('تغير الهامش من ٥٪ إلى -٥٪.',['تغير الهامش من -٥٪ إلى ٥٪.']).some(x=>x.includes('numeric range')));
});
test('changed project figure preserves an unrelated work edit',()=>{
 const source='Reported an operating margin of -5%.',{p,raw}=rig(source,'projects');
 raw.entries.find(x=>x.id==='project_1').bullets[0].text='Reported an operating margin of 5%.';
 raw.entries.find(x=>x.id==='work_1').bullets[1].text='Improved workflows for delivery and reduced technical overhead.';
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.projects.data[0].bullets[0].text,source);
 a.equal(out.candidate.experience.data[0].bullets[1].text,raw.entries.find(x=>x.id==='work_1').bullets[1].text);
});
test('changed sign in summary is removed, preserving original summary',()=>{
 const {p,raw}=rig('Reported an operating margin of -5%.');
 raw.summarySegments=[{text:'Operating margin measured 5%.',sourceIds:['work_1_b1']}];
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.summary.data,p.summary.data.trim());
 a(out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.kind==='removed'&&x.message.includes('sign')));
});
for(const [source,proposal] of [
 ['Reported an operating margin of -5%.','Reported a margin of −5%.'],
 ['Reported an operating margin of +5%.','Reported a margin of 5%.'],
 ['Reported a value of -0%.','Reported a value of 0%.'],
 ['Worked on records from 2020-2022.','Worked on records in 2022.'],
 ['Reported a deficit of -٥٪.','Reported a deficit of -5%.'],
 ['Reported a change from -5% to 5%.','Reported a change from -5% to +5%.'],
]) test('sign check permits these unchanged or ambiguous cases: '+source,()=>{
 a(!scopeRisk(proposal,[source]).some(x=>x.includes('sign')||x.includes('numeric range')));
});
test('both signs cited without a recognizable range are ambiguous, not automatically judged',()=>{
 a(!scopeRisk('Reported a margin of 5%.',['Reported -5%.','Reported 5%.']).some(x=>x.includes('sign')));
});
test('locked work remains unchanged',()=>{
 const {p}=rig('Reported an operating margin of -5%.');p.experience.isLocked=true;
 const raw={skillSelections:[],summarySegments:[],entries:[{id:'work_1',overview:{text:'',sourceIds:[]},bullets:[{sourceIds:['work_1_b1'],text:'Reported an operating margin of 5%.'}]}]};
 a.deepEqual(n.compileNaturalComposition(p,raw,job).candidate.experience,p.experience);
});
