// Fictional offline tests. Numeric token matching is not measurement or semantic verification.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const {unsupportedNumbers}=load('services/resumeComposer/terms');
const n=load('services/resumeComposer/naturalDocument');
function rig(text,section='experience') {
 const p=fixture();p.experience.data[0].bullets[0].text=text;
 if(section==='projects')p.projects.data=[{id:crypto.randomUUID(),name:'Fictional project',role:'Contributor',technologies:[],bullets:[{id:crypto.randomUUID(),text,isVerified:true}]}];
 const before=JSON.stringify(p),s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const entries=[...s.experience,...s.projects].filter(e=>!(e.id.startsWith('work_')?s.locks.experience:s.locks.projects)).map(e=>({id:e.id,overview:e.overviewId?{text:f.get(e.overviewId),sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))}));
 return {p,before,raw:{summarySegments:[],entries,skillSelections:[]}};
}
for(const [source,proposed] of [
 ['راجعت التقارير.','راجعت ٥٠ تقريراً.'],
 ['راجعت ٣ تقارير.','راجعت ٨ تقارير.'],
 ['راجعت ۳ تقارير.','راجعت ۸ تقارير.'],
 ['خفضت التكلفة بنسبة ١٫٥٪.','خفضت التكلفة بنسبة ١٫٦٪.'],
 ['راجعت ١٬٢٠٠ تقرير.','راجعت ١٬٦٠٠ تقرير.'],
]) test('new Arabic-script numeric claim is not silently accepted: '+source,()=>{
 const {p,raw,before}=rig(source);raw.entries[0].bullets[0].text=proposed;
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a(out.guardNotes.some(x=>x.path==='entries.work_1.bullets.0'&&x.kind==='restored'&&x.message.includes('does not mention')));
 a.equal(JSON.stringify(p),before);
});
for(const [source,proposed] of [
 ['راجعت ٣ تقارير.','راجعت 3 تقارير.'],
 ['راجعت ۳ تقارير.','راجعت ٣ تقارير.'],
 ['خفضت التكلفة بنسبة ١٫٥٪.','خفضت التكلفة بنسبة 1.5٪.'],
 ['راجعت ١٬٢٠٠ تقرير.','راجعت 1,200 تقرير.'],
]) test('equivalent Arabic and Western digit formatting remains editable: '+source,()=>{
 const {p,raw}=rig(source);raw.entries[0].bullets[0].text=proposed;
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.experience.data[0].bullets[0].text,proposed);
});
test('unsupported numeric summary is removed',()=>{
 const {p,raw}=rig('راجعت التقارير.');raw.summarySegments=[{text:'خبرة في مراجعة ٥٠ تقريراً.',sourceIds:['work_1_b1']}];
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.summary.data,p.summary.data.trim());
 a(out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.kind==='removed'&&x.message.includes('does not mention')));
});
test('a project numeric change restores its source while keeping an independent edit',()=>{
 const source='راجعت ٣ تقارير.',{p,raw}=rig(source,'projects');
 raw.entries.find(x=>x.id==='project_1').bullets[0].text='راجعت ٨ تقارير.';
 raw.entries.find(x=>x.id==='work_1').bullets[1].text='Improved workflows for delivery and reduced technical overhead.';
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.projects.data[0].bullets[0].text,source);
 a.equal(out.candidate.experience.data[0].bullets[1].text,raw.entries.find(x=>x.id==='work_1').bullets[1].text);
});
test('numbers from a different source do not justify this work line',()=>{
 const {p,raw}=rig('راجعت ٣ تقارير.');p.experience.data[0].bullets[1].text='راجعت ٨ ملفات.';
 raw.entries[0].bullets[0].text='راجعت ٨ تقارير.';
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.experience.data[0].bullets[0].text,'راجعت ٣ تقارير.');
});
test('numbers supported by separately cited passages are accepted as tokens, not semantically verified',()=>{
 a.deepEqual(unsupportedNumbers('٣ و 8',['القيمة 3','القيمة ٨']),[]);
});
test('Western numeric grounding still rejects changed values',()=>{
 a.deepEqual(unsupportedNumbers('Improved results by 14.5%',['Improved results by 12.5%']),['14.5']);
 a.deepEqual(unsupportedNumbers('Handled 1,200 records',['Handled 1200 records']),[]);
});
test('only digit tokens are checked, not written numbers, units or meaning',()=>{
 a.deepEqual(unsupportedNumbers('twenty days',['twenty hours']),[]);
 a.deepEqual(unsupportedNumbers('٥ days',['٥ hours']),[]);
});
test('locked experience remains unchanged despite invented Arabic digits',()=>{
 const {p}=rig('راجعت التقارير.');p.experience.isLocked=true;
 const raw={skillSelections:[],summarySegments:[],entries:[{id:'work_1',overview:{text:'',sourceIds:[]},bullets:[{sourceIds:['work_1_b1'],text:'راجعت ٥٠ تقريراً.'}]}]};
 const out=n.compileNaturalComposition(p,raw,job);a.deepEqual(out.candidate.experience,p.experience);
});
test('numeric formatting does not disable protected skill-name checks',()=>{
 const {analyzeTerms,buildTermIndex}=load('services/resumeComposer/terms');
 a.deepEqual(analyzeTerms('Used 1.5.',['Used ١٫٥.'],[]).unsupported,[]);
 a(analyzeTerms('Used Node.js.',['Worked on web pages.'],[]).unsupported.some(x=>x.label==='Node.js'));
 a(analyzeTerms('Used 1.5.',['Used ١٫٥.'],buildTermIndex(['1.5'])).unsupported.some(x=>x.label==='1.5'));
});
test('grouped decimals compare as whole values without masking an invented fraction',()=>{
 a.deepEqual(unsupportedNumbers('١٬٢٠٠٫٥٠',['1,200.50']),[]);
 a.deepEqual(unsupportedNumbers('١٬٢٠٠٫٥١',['1,200.50']),['١٬٢٠٠٫٥١']);
});
