// Fictional, offline Arabic-language examples. Literal detection is not a
// grammar parser, translation check, or guarantee of semantic correctness.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {scopeRisk}=load('services/resumeComposer/scopeRisk');
function rig(source,section='experience') {
 const p=fixture();p.experience.data[0].bullets[0].text=source;
 if(section==='projects')p.projects.data=[{id:crypto.randomUUID(),name:'مشروع افتراضي',role:'مشارك',technologies:[],bullets:[{id:crypto.randomUUID(),text:source,isVerified:true}]}];
 const before=JSON.stringify(p),s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const entries=[...s.experience,...s.projects].filter(e=>!(e.id.startsWith('work_')?s.locks.experience:s.locks.projects)).map(e=>({id:e.id,overview:e.overviewId?{text:f.get(e.overviewId),sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))}));
 return {p,before,raw:{summarySegments:[],entries,skillSelections:[]}};
}
for(const [source,proposed] of [
 ['اختبرت التطبيق ولم أنشره في الإنتاج.','اختبرت التطبيق ونشرت التطبيق في الإنتاج.'],
 ['راجع التقارير ولم يعتمد النتائج.','راجع التقارير واعتمد النتائج.'],
 ['راجع الملفات فلن يحذفها.','راجع الملفات وحذفها.'],
 ['اختبرت التطبيق دون نشره في الإنتاج.','اختبرت التطبيق ونشرته في الإنتاج.'],
 ['نفذت المهمة بدون إشراف.','نفذت المهمة بإشراف.'],
 ['ليست الخدمة متاحة للعميل.','الخدمة متاحة للعميل.'],
 ['اختبرت التطبيق وَلَمْ أنشره.','اختبرت التطبيق ونشرته.'],
 ['لا أستخدم البيانات الشخصية.','أستخدم البيانات الشخصية.'],
 ['راجعت الملفات ولا أحذفها.','راجعت الملفات وحذفتها.'],
]) test('an explicit Arabic limitation cannot silently disappear: '+source,()=>{
 const {p,raw,before}=rig(source);raw.entries[0].bullets[0].text=proposed;
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a(out.guardNotes.some(x=>x.path==='entries.work_1.bullets.0'&&x.kind==='restored'&&x.message.includes('limitation')));
 a.equal(JSON.stringify(p),before);
});
test('a newly introduced Arabic negative is not silently accepted',()=>{
 const source='اختبرت التطبيق ونشرته.',{p,raw}=rig(source);raw.entries[0].bullets[0].text='اختبرت التطبيق ولم أنشره.';
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a(out.guardNotes.some(x=>x.message.includes('negative statement')));
});
test('moving لم to a different action is detected even though a negative remains',()=>{
 const source='اختبرت التطبيق ولم أنشره.',{p,raw}=rig(source);raw.entries[0].bullets[0].text='نشرت التطبيق ولم أختبره.';
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a(out.guardNotes.some(x=>x.message.includes('Arabic negation')));
});
test('changing لم into لن is not treated as the same temporal claim',()=>{
 const source='اختبرت التطبيق ولم أنشره.',{p,raw}=rig(source);raw.entries[0].bullets[0].text='اختبرت التطبيق ولن أنشره.';
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a(out.guardNotes.some(x=>x.message.includes('Arabic negation')));
});
test('an independent supported edit remains when an Arabic project claim is restored',()=>{
 const source='اختبرت التطبيق ولم أنشره.',{p,raw}=rig(source,'projects');
 raw.entries.find(x=>x.id==='project_1').bullets[0].text='اختبرت التطبيق ونشرته.';
 raw.entries.find(x=>x.id==='work_1').bullets[1].text='Improved workflows for delivery and reduced technical overhead.';
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.projects.data[0].bullets[0].text,source);
 a.equal(out.candidate.experience.data[0].bullets[1].text,'Improved workflows for delivery and reduced technical overhead.');
});
test('a generated Arabic summary cannot discard the explicit negative',()=>{
 const source='اختبرت التطبيق ولم أنشره في الإنتاج.',{p,raw}=rig(source);
 raw.summarySegments=[{text:'خبرة في اختبار التطبيق ونشره في الإنتاج.',sourceIds:['work_1_b1']}];
 const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.summary.data,p.summary.data.trim());
 a(out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.kind==='removed'&&x.message.includes('limitation')));
});
test('a preserved negative action can be edited without automatic restoration',()=>{
 const source='اختبرت التطبيق ولم أنشره في الإنتاج.',proposed='اختبرت التطبيق ولم أنشره.';
 const {p,raw}=rig(source);raw.entries[0].bullets[0].text=proposed;
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.experience.data[0].bullets[0].text,proposed);
});
test('the positive idiom ليس فقط is not treated as negation',()=>{
 const source='ليس فقط راجعت البيانات بل كتبت التقارير.',proposed='راجعت البيانات وكتبت التقارير.';
 const {p,raw}=rig(source);raw.entries[0].bullets[0].text=proposed;
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.experience.data[0].bullets[0].text,proposed);
});
test('unchanged Arabic originals remain intact',()=>{
 const source='اختبرت التطبيق ولم أنشره.',{p,raw}=rig(source);const out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.experience.data[0].bullets[0].text,source);a(!out.guardNotes.some(x=>x.path==='entries.work_1.bullets.0'));
});
test('explicit English and Arabic negatives are not rejected merely for using different languages',()=>{
 a(!scopeRisk('Tested the application but did not publish it.',['اختبرت التطبيق ولم أنشره.']).some(x=>x.includes('limitation')||x.includes('negative statement')));
});
test('synonymous Arabic verbs can conservatively cause an original to be restored',()=>{
 const source='اختبرت التطبيق ولم أنشره.',{p,raw}=rig(source);raw.entries[0].bullets[0].text='اختبرت التطبيق ولم أصدره.';
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.experience.data[0].bullets[0].text,source);
});
test('ما and other unrecognized forms remain an explicit blind spot',()=>{
 a(!scopeRisk('استخدمت البيانات.',['ما استخدمت البيانات.']).some(x=>x.includes('limitation')));
});

test('common positive idioms with لا are not treated as negative claims',()=>{
 for(const [source,proposal] of [
  ['أعددت التقارير ولا سيما تقارير المبيعات.','أعددت تقارير المبيعات.'],
  ['لا يزال يعمل على تنظيم البيانات.','يواصل العمل على تنظيم البيانات.'],
  ['لا بد من مراجعة التقارير.','تجب مراجعة التقارير.'],
 ]) a(!scopeRisk(proposal,[source]).some(x=>x.includes('limitation')),source);
});
test('moving لا to a different action is a review signal, not a semantic verdict',()=>{
 const source='أراجع الملفات ولا أحذفها.',{p,raw}=rig(source);raw.entries[0].bullets[0].text='أحذف الملفات ولا أراجعها.';
 const out=n.compileNaturalComposition(p,raw,job);a.equal(out.candidate.experience.data[0].bullets[0].text,source);
 a(out.guardNotes.some(x=>x.message.includes('Arabic negation')));
});
test('negation particles inside unrelated words are not treated as standalone markers',()=>{
 for(const [source,proposed] of [
  ['راجعت ملفات السلامة بعناية.','راجعت ملفات السلامة.'],
  ['أعددت ملخص المشروع.','أعددت ملخصاً للمشروع.'],
 ]) a(!scopeRisk(proposed,[source]).some(x=>x.includes('limitation')||x.includes('negative statement')));
});
test('common positive idioms do not hide a separate genuine negative',()=>{
 const source='لا يزال يختبر التطبيق ولم ينشره.',proposed='يواصل اختبار التطبيق وينشره.';
 a(scopeRisk(proposed,[source]).some(x=>x.includes('limitation')));
});
test('locked Arabic experience ignores conflicting model output',()=>{
 const source='اختبرت التطبيق ولم أنشره.',{p}=rig(source);p.experience.isLocked=true;
 const raw={skillSelections:[],summarySegments:[],entries:[{id:'work_1',overview:{text:'',sourceIds:[]},bullets:[{sourceIds:['work_1_b1'],text:'اختبرت التطبيق ونشرته.'}]}]};
 const out=n.compileNaturalComposition(p,raw,job);a.deepEqual(out.candidate.experience,p.experience);
});
