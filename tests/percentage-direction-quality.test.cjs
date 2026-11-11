// Fictional regression cases. A literal direction check cannot verify meaning,
// measured object, causation, equivalent wordings, or writing quality.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {scopeRisk}=load('services/resumeComposer/scopeRisk');
function rig(text,section='experience'){
 const p=fixture();p.experience.data[0].bullets[0].text=text;
 if(section==='projects')p.projects.data=[{id:crypto.randomUUID(),name:'Fictional project',role:'Contributor',bullets:[{id:crypto.randomUUID(),text,isVerified:true}]}];
 const before=JSON.stringify(p),s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const entries=[...s.experience,...s.projects].filter(e=>!(e.id.startsWith('work_')?s.locks.experience:s.locks.projects)).map(e=>({id:e.id,overview:e.overviewId?{text:f.get(e.overviewId),sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))}));
 return {p,before,raw:{summarySegments:[],entries,skillSelections:[]}};
}
for(const [source,proposal] of [
 ['Reduced processing costs by 20%.','Increased processing costs by 20%.'],
 ['Increased monthly revenue by 15%.','Decreased monthly revenue by 15%.'],
 ['Cut customer wait time by 12.5 percent.','Raised customer wait time by 12.5%.'],
 ['Raised completion by 7 percentage points.','Lowered completion by 7 percentage points.'],
 ['خفض وقت معالجة الطلبات بنسبة ٢٠٪.','زاد وقت معالجة الطلبات بنسبة ٢٠٪.'],
 ['زاد معدل استكمال الطلبات بنسبة ١٥٪.','انخفض معدل استكمال الطلبات بنسبة ١٥٪.'],
]) test('opposite explicit percentage direction restores original: '+source,()=>{
 const {p,before,raw}=rig(source);raw.entries[0].bullets[0].text=proposal;
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a(out.guardNotes.some(x=>x.path==='entries.work_1.bullets.0'&&x.kind==='restored'&&x.message.includes('percentage direction')));
 a.equal(JSON.stringify(p),before);
});
test('a reversed project metric does not discard an independent work improvement',()=>{
 const source='Reduced processing costs by 20%.',{p,raw}=rig(source,'projects');
 raw.entries.find(x=>x.id==='project_1').bullets[0].text='Increased processing costs by 20%.';
 raw.entries.find(x=>x.id==='work_1').bullets[1].text='Improved workflows for delivery and reduced technical overhead.';
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.projects.data[0].bullets[0].text,source);
 a.equal(out.candidate.experience.data[0].bullets[1].text,raw.entries.find(x=>x.id==='work_1').bullets[1].text);
});
test('a reversed generated summary is removed rather than saved',()=>{
 const {p,raw}=rig('Reduced processing costs by 20%.');
 raw.summarySegments=[{text:'Costs increased by 20%.',sourceIds:['work_1_b1']}];
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.summary.data,p.summary.data.trim());
 a(out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.kind==='removed'&&x.message.includes('percentage direction')));
});
for(const [source,proposal] of [
 ['Reduced processing costs by 20%.','Lowered processing costs by 20%.'],
 ['Increased monthly revenue by 15%.','Raised monthly revenue by 15 percent.'],
 ['خفض وقت معالجة الطلبات بنسبة ٢٠٪.','قلل وقت معالجة الطلبات بنسبة 20%.'],
 ['Reduced errors by 20% and increased revenue by 20%.','Increased revenue by 20%.'],
 ['Reduced errors by 20% while increasing revenue by 20%.','Increased revenue by 20%.'],
 ['Reduced delays and increased revenue by 20%.','Increased revenue by 20%.'],
]) test('same or ambiguous direction is not rejected by this check: '+source,()=>{
 a(!scopeRisk(proposal,[source]).some(x=>x.includes('percentage direction')));
});
test('both directions across cited passages are ambiguous',()=>{
 a(!scopeRisk('Increased revenue by 20%.',['Reduced errors by 20%.','Increased revenue by 20%.']).some(x=>x.includes('percentage direction')));
});
test('different magnitudes and units are not judged by this narrow check',()=>{
 for(const proposal of ['Increased costs by 10%.','Increased costs by 20 percentage points.','Increased costs by 20 dollars.'])
  a(!scopeRisk(proposal,['Reduced costs by 20%.']).some(x=>x.includes('percentage direction')));
});
test('locked experience remains unchanged',()=>{
 const {p}=rig('Reduced processing costs by 20%.');p.experience.isLocked=true;
 const raw={skillSelections:[],summarySegments:[],entries:[{id:'work_1',overview:{text:'',sourceIds:[]},bullets:[{sourceIds:['work_1_b1'],text:'Increased processing costs by 20%.'}]}]};
 a.deepEqual(n.compileNaturalComposition(p,raw,job).candidate.experience,p.experience);
});

test('zero changes and signed percentages are not assigned a direction by this check',()=>{
 for(const [source,proposal] of [
  ['Reduced costs by 0%.','Increased costs by 0%.'],
  ['Reduced costs by -20%.','Increased costs by -20%.'],
 ]) a(!scopeRisk(proposal,[source]).some(x=>x.includes('percentage direction')));
});
test('matching percentages do not certify what was measured',()=>{
 a(!scopeRisk('Reduced revenue by 20%.',['Reduced costs by 20%.']).some(x=>x.includes('percentage direction')));
});
test('Arabic multi-action clauses are not assigned a direction by borrowing the later percentage',()=>{
 a(!scopeRisk('زاد الإنتاج بنسبة ٢٠٪.',['خفض التكاليف ورفع الإنتاج بنسبة ٢٠٪.']).some(x=>x.includes('percentage direction')));
});
test('grouped and Arabic digits normalize for literal percentage direction',()=>{
 a(scopeRisk('Increased costs by ١٬٢٠٠٫٥٪.',['Reduced costs by 1,200.5%.']).some(x=>x.includes('percentage direction')));
});
