// Fictional offline scenarios. A literal range signal does not establish truth,
// units, causal attribution, measurement scope, relevance or model quality.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {scopeRisk}=load('services/resumeComposer/scopeRisk');
function setup(original,section='experience') {
 const p=fixture();p.experience.data[0].bullets[0].text=original;
 if(section==='projects')p.projects.data=[{id:crypto.randomUUID(),name:'Fictional project',role:'Contributor',technologies:[],bullets:[{id:crypto.randomUUID(),text:original,isVerified:true}]}];
 const before=JSON.stringify(p),s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const raw={summarySegments:[],entries:[...s.experience,...s.projects].filter(e=>!(e.id.startsWith('work_')?s.locks.experience:s.locks.projects)).map(e=>({id:e.id,overview:e.overviewId?{text:f.get(e.overviewId),sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))})),skillSelections:[]};
 return {p,before,s,raw};
}
for(const [source,proposal] of [
 ['Reduced time preparing reports from 8 to 3 hours.','Reduced time preparing reports from 3 to 8 hours.'],
 ['Reduced response latency from 900 ms to 320 ms.','Reduced response latency from 320 ms to 900 ms.'],
 ['Increased monthly output from 1,200 to 1,600 units.','Increased monthly output from 1,600 to 1,200 units.'],
 ['Reduced processing cost from $2.50 to $1.25.','Reduced processing cost from $1.25 to $2.50.'],
 ['Raised accuracy from 40% to 80%.','Raised accuracy from 80% to 40%.'],
]) test('reversed numeric endpoints restore original work wording: '+source,()=>{
 const {p,before,raw}=setup(source);raw.entries[0].bullets[0].text=proposal;
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a(out.guardNotes.some(x=>x.kind==='restored'&&x.path==='entries.work_1.bullets.0'&&x.message.includes('numeric range')));
 a.equal(JSON.stringify(p),before);
});
test('a reversed project metric is restored without undoing an independent work edit',()=>{
 const source='Reduced time preparing reports from 8 to 3 hours.',{p,raw}=setup(source,'projects');
 raw.entries.find(x=>x.id==='project_1').bullets[0].text='Reduced time preparing reports from 3 to 8 hours.';
 raw.entries.find(x=>x.id==='work_1').bullets[1].text='Improved workflows for delivery and reduced technical overhead.';
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.projects.data[0].bullets[0].text,source);
 a.equal(out.candidate.experience.data[0].bullets[1].text,'Improved workflows for delivery and reduced technical overhead.');
 a(out.guardNotes.some(x=>x.path==='entries.project_1.bullets.0'&&x.message.includes('numeric range')));
});
test('a reversed range in a generated summary is removed with a review reason',()=>{
 const {p,raw}=setup('Reduced time preparing reports from 8 to 3 hours.');
 raw.summarySegments=[{text:'Reporting time decreased from 3 to 8 hours.',sourceIds:['work_1_b1']}];
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.summary.data,p.summary.data.trim());
 a(out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.kind==='removed'&&x.message.includes('numeric range')));
});
for(const [source,proposal] of [
 ['Reduced time preparing reports from 8 to 3 hours.','Reduced reporting time from 8 to 3 hours.'],
 ['Reduced response latency from 900 ms to 320 ms.','Reduced latency from 900 ms to 320 ms.'],
 ['Improved response time by reducing it from 8 to 3 hours.','Improved response time from 8 to 3 hours.'],
]) test('preserved numeric direction remains editable: '+source,()=>{
 const {p,raw}=setup(source);raw.entries[0].bullets[0].text=proposal;
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,proposal);
 a(!out.guardNotes.some(x=>x.path==='entries.work_1.bullets.0'&&x.message.includes('numeric range')));
});
test('unchanged originals and valid independent edits remain unchanged',()=>{
 const source='Reduced time preparing reports from 8 to 3 hours.',{p,raw}=setup(source);
 raw.entries[0].bullets[1].text='Improved workflows for delivery and reduced technical overhead.';
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a.equal(out.candidate.experience.data[0].bullets[1].text,raw.entries[0].bullets[1].text);
 a(!out.guardNotes.some(x=>x.message.includes('numeric range')));
});
test('separately cited opposite ranges are ambiguous, not automatically judged',()=>{
 const src=['Counts increased from 3 to 8.','Counts later decreased from 8 to 3.'];
 a(!scopeRisk('Counts decreased from 8 to 3.',src).some(x=>x.includes('numeric range')));
});
test('other languages and forms remain an explicit blind spot, not certified correct',()=>{
 a(!scopeRisk('Le temps a baissé de 3 à 8 heures.',['Le temps a baissé de 8 à 3 heures.']).some(x=>x.includes('numeric range')));
 a(!scopeRisk('Reduced time 3→8 hours.',['Reduced time 8→3 hours.']).some(x=>x.includes('numeric range')));
});

for(const [source,proposal] of [
 ['خفض وقت إعداد التقارير من ٨ إلى ٣ ساعات.','خفض وقت إعداد التقارير من ٣ إلى ٨ ساعات.'],
 ['خفض وقت إعداد التقارير من 8 ساعات إلى 3 ساعات.','خفض وقت إعداد التقارير من 3 ساعات إلى 8 ساعات.'],
 ['خفض وقت إعداد التقارير من ۸ الى ۳ ساعات.','خفض وقت إعداد التقارير من ۳ الى ۸ ساعات.'],
 ['Reduced time from ٨ to ٣ hours.','Reduced time from ٣ to ٨ hours.'],
]) test('Arabic or mixed-script digits in a range do not silently reverse: '+source,()=>{
 const {p,raw}=setup(source);raw.entries[0].bullets[0].text=proposal;const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a(out.guardNotes.some(x=>x.path==='entries.work_1.bullets.0'&&x.message.includes('numeric range')));
});
test('Arabic range in the original direction stays editable',()=>{
 const source='خفض وقت إعداد التقارير من ٨ إلى ٣ ساعات.', proposed='خفض وقت التقارير من ٨ إلى ٣ ساعات.';
 const {p,raw}=setup(source);raw.entries[0].bullets[0].text=proposed;
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.experience.data[0].bullets[0].text,proposed);
});
test('Arabic summary with reversed endpoints is removed while the source stays intact',()=>{
 const source='خفض وقت إعداد التقارير من ٨ إلى ٣ ساعات.',{p,raw,before}=setup(source);
 raw.summarySegments=[{text:'انخفض وقت التقارير من ٣ إلى ٨ ساعات.',sourceIds:['work_1_b1']}];
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.summary.data,p.summary.data.trim());
 a(out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.kind==='removed'&&x.message.includes('numeric range')));
 a.equal(JSON.stringify(p),before);
});
test('equivalent numeral scripts and Arabic decimal/thousands signs are recognized by the range signal',()=>{
 for(const [source,proposal] of [
  ['خفض الوقت من ٨ إلى ٣ ساعات.','خفض الوقت من 3 إلى 8 ساعات.'],
  ['خفض التكلفة من ٢٫٥ إلى ١٫٢٥ ريال.','خفض التكلفة من ١٫٢٥ إلى ٢٫٥ ريال.'],
  ['زاد الإنتاج من ١٬٢٠٠ إلى ١٬٦٠٠ وحدة.','زاد الإنتاج من ١٬٦٠٠ إلى ١٬٢٠٠ وحدة.'],
 ]) a(scopeRisk(proposal,[source]).some(x=>x.includes('numeric range')),source);
});
test('locked experience remains byte-for-byte unchanged despite a conflicting AI entry',()=>{
 const source='Reduced time preparing reports from 8 to 3 hours.',{p}=setup(source);p.experience.isLocked=true;
 const s=n.prepareNaturalComposition(p,job).source;
 const raw={skillSelections:[],summarySegments:[],entries:[{id:'work_1',overview:{text:'',sourceIds:[]},bullets:[{sourceIds:['work_1_b1'],text:'Reduced time preparing reports from 3 to 8 hours.'}]}]};
 const out=n.compileNaturalComposition(p,raw,job);a.deepEqual(out.candidate.experience,p.experience);a.equal(s.locks.experience,true);
});
