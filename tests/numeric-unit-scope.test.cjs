// Fictional offline cases: literal unit comparison does not verify metric meaning.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {scopeRisk}=load('services/resumeComposer/scopeRisk');
function rig(text,section='experience') {
 const p=fixture();p.experience.data[0].bullets[0].text=text;
 if(section==='projects')p.projects.data=[{id:crypto.randomUUID(),name:'Fictional project',role:'Contributor',technologies:[],bullets:[{id:crypto.randomUUID(),text,isVerified:true}]}];
 const before=JSON.stringify(p),s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const entries=[...s.experience,...s.projects].filter(e=>!(e.id.startsWith('work_')?s.locks.experience:s.locks.projects)).map(e=>({id:e.id,overview:e.overviewId?{text:f.get(e.overviewId),sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))}));
 return {p,before,raw:{summarySegments:[],entries,skillSelections:[]}};
}
for(const [source,proposal] of [
 ['Reduced processing time by 5 hours.','Reduced processing time by 5 days.'],
 ['The task took 30 minutes.','The task took 30 seconds.'],
 ['Reduced response time by 20%.','Reduced response time by 20 hours.'],
 ['Improved accuracy by 10 percentage points.','Improved accuracy by 10 percent.'],
 ['استغرق إعداد التقارير ٥ ساعات.','استغرق إعداد التقارير ٥ أيام.'],
 ['استغرق إعداد التقارير ۳ ساعات.','استغرق إعداد التقارير 3 days.'],
]) test('changed explicit metric units restore original: '+source,()=>{
 const {p,raw,before}=rig(source);raw.entries[0].bullets[0].text=proposal;
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a(out.guardNotes.some(x=>x.path==='entries.work_1.bullets.0'&&x.kind==='restored'&&x.message.includes('unit')));
 a.equal(JSON.stringify(p),before);
});
for(const [source,proposal] of [
 ['Reduced processing time by 5 hours.','Reduced processing time by 5 hour.'],
 ['Reduced response time by 20%.','Response time fell by 20 percent.'],
 ['Measured latency of 12 milliseconds.','Measured latency of 12 ms.'],
 ['استغرق إعداد التقارير ٥ ساعات.','استغرق إعداد التقارير 5 hours.'],
 ['استغرق إعداد التقارير ٥ ساعات.','استغرق إعداد التقارير ٥ سَاعَات.'],
]) test('equivalent explicit units do not trigger the unit check: '+source,()=>{
 a(!scopeRisk(proposal,[source]).some(x=>x.includes('unit')));
});
test('a valid paraphrase with the same explicit unit remains editable',()=>{
 const {p,raw}=rig('Reduced processing time by 5 hours.');
 raw.entries[0].bullets[0].text='Reduced the processing time by 5 hours.';
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.experience.data[0].bullets[0].text,raw.entries[0].bullets[0].text);
});
test('changed metric unit in a project preserves an independent work edit',()=>{
 const source='Reduced processing time by 5 hours.',{p,raw}=rig(source,'projects');
 raw.entries.find(x=>x.id==='project_1').bullets[0].text='Reduced processing time by 5 days.';
 raw.entries.find(x=>x.id==='work_1').bullets[1].text='Improved workflows for delivery and reduced technical overhead.';
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.projects.data[0].bullets[0].text,source);
 a.equal(out.candidate.experience.data[0].bullets[1].text,raw.entries.find(x=>x.id==='work_1').bullets[1].text);
});
test('changed metric unit in generated summary is removed with a note',()=>{
 const {p,raw}=rig('Reduced processing time by 5 hours.');
 raw.summarySegments=[{text:'Processing time reduced by 5 days.',sourceIds:['work_1_b1']}];
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.summary.data,p.summary.data.trim());
 a(out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.kind==='removed'&&x.message.includes('unit')));
});
test('cited source already contains both units at the same value, so do not judge',()=>{
 a(!scopeRisk('Completed checks after 5 days.',['Worked for 5 hours.','Completed checks after 5 days.']).some(x=>x.includes('unit')));
});
test('a missing unit or an unrecognized unit is not treated as a unit mismatch',()=>{
 for(const proposed of ['Reduced processing time by 5.','Processed 5 records.'])
  a(!scopeRisk(proposed,['Reduced processing time by 5 hours.']).some(x=>x.includes('unit')));
});
test('unit matching alone does not verify the measured object',()=>{
 a(!scopeRisk('Reduced delivery cost by 5 hours.',['Reduced processing time by 5 hours.']).some(x=>x.includes('unit')));
});
test('locked experience ignores changed units',()=>{
 const {p}=rig('Reduced processing time by 5 hours.');p.experience.isLocked=true;
 const raw={skillSelections:[],summarySegments:[],entries:[{id:'work_1',overview:{text:'',sourceIds:[]},bullets:[{sourceIds:['work_1_b1'],text:'Reduced processing time by 5 days.'}]}]};
 const out=n.compileNaturalComposition(p,raw,job);a.deepEqual(out.candidate.experience,p.experience);
});
test('unit aliases preserve case, grouped numerals and spacing for comparison only',()=>{
 for(const [source,proposal] of [
  ['Processed work for 1,200.5 HOURS.','Processed work for ١٬٢٠٠٫٥ hours.'],
  ['Measured 10 percentage points.','Measured 10 percent points.'],
  ['Measured 20 ٪.','Measured 20%.'],
 ]) a(!scopeRisk(proposal,[source]).some(x=>x.includes('unit')));
 a(scopeRisk('Completed work in ١٬٢٠٠٫٥ days.',['Completed work in 1,200.5 hours.']).some(x=>x.includes('unit')));
});
test('unit words are matched as whole words, not prefixes or suffixes',()=>{
 a(!scopeRisk('Processed 5 hoursheets.',['Processed 5 days.']).some(x=>x.includes('unit')));
 a(!scopeRisk('Processed code5 hours.',['Processed 5 days.']).some(x=>x.includes('unit')));
});
test('a different number is outside this narrow check',()=>{
 a(!scopeRisk('Completed work in 3 days.',['Completed work in 5 hours.']).some(x=>x.includes('unit')));
});
test('unlisted units and indirect comparisons remain blind spots',()=>{
 a(!scopeRisk('Moved 5 kilometers.',['Moved 5 meters.']).some(x=>x.includes('unit')));
});
