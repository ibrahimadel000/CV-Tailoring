// Fictional scenarios: exact required-list matching is not semantic verification.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {explicitSkillCoverage}=load('services/resumeComposer/explicitSkillCoverage');
const referenceJob='A fictional role involving business operations and delivery coordination.';
function rig(){
 const p=fixture();p.skills.data=[
  {id:crypto.randomUUID(),name:'Accounting',category:'Technical',level:'Coursework only'},
  {id:crypto.randomUUID(),name:'Bookkeeping',category:'Technical',level:'Beginner'},
  {id:crypto.randomUUID(),name:'Excel',category:'Tools',level:''},
  {id:crypto.randomUUID(),name:'Budgeting',category:'Technical',level:''},
 ];
 const s=n.prepareNaturalComposition(p,referenceJob).source;
 return {p,s,add:(job,selected=[])=>explicitSkillCoverage(p,s,job,selected)};
}
for(const [job,expected] of [
 ['Required skills: Accounting, Bookkeeping, Excel.',['Accounting','Bookkeeping','Excel']],
 ['Essential skills: Budgeting, Accounting',['Accounting','Budgeting']],
 ['Mandatory skills:\n- Bookkeeping\n- Excel\nResponsibilities:\n- Budgeting',['Bookkeeping','Excel']],
 ['Required skills:\n• Accounting\n• Excel',['Accounting','Excel']],
]) test('retains only exact native skills in an explicit required list: '+job,()=>{
 const {add}=rig();a.deepEqual(add(job).map(x=>x.name),expected);
});
for(const job of [
 'We offer accounting and bookkeeping services.',
 'Preferred skills: Accounting, Bookkeeping.',
 'Required skills: Accounting (optional), Bookkeeping (optional).',
 'Required skills: Accountancy, Bookkeepers.',
 'Required skills: Accounting/Bookkeeping.',
 'Required skills: Accounting, Bookkeeping.\nNo Accounting or Bookkeeping is required.',
 'Required skills: Accounting, Bookkeeping.\nAccounting and Bookkeeping are prohibited.',
 'Required skills: Accounting, Bookkeeping.\nلا نحتاج إلى Accounting أو Bookkeeping.',
]) test('does not infer a required skill from ambiguous or contradictory wording: '+job,()=>{
 const {add}=rig();a(!add(job).some(x=>x.name==='Accounting'||x.name==='Bookkeeping'));
});
test('a contradictory mention suppresses only its matching native skill',()=>{
 const {add}=rig();a.deepEqual(add('Required skills: Accounting, Excel.\nAccounting is not required.').map(x=>x.name),['Excel']);
});
test('a heading ends when its bullet list ends',()=>{
 const {add}=rig();a.deepEqual(add('Required skills:\n- Accounting\n\nBenefits:\n- Excel').map(x=>x.name),['Accounting']);
});
test('a selected skill is not repeated or removed, and locks are respected',()=>{
 const {p,s,add}=rig();a(!add('Required skills: Accounting.',[{id:'skill_1',category:'Technical'}]).length);
 p.skills.isLocked=true;const locked=n.prepareNaturalComposition(p,referenceJob).source;
 a.deepEqual(explicitSkillCoverage(p,locked,'Required skills: Accounting.',[]),[]);
});
test('does not select a combined label from a partial required list item',()=>{
 const {p}=rig();p.skills.data[0].name='Accounting (Excel)';
 const s=n.prepareNaturalComposition(p,referenceJob).source;
 a(!explicitSkillCoverage(p,s,'Required skills: Accounting.',[]).some(x=>x.id==='skill_1'));
});
test('different qualifications on duplicate names are not guessed',()=>{
 const {p}=rig();p.skills.data.push({id:crypto.randomUUID(),name:'Accounting',category:'Technical',level:'Expert'});
 const s=n.prepareNaturalComposition(p,referenceJob).source;
 a(!explicitSkillCoverage(p,s,'Required skills: Accounting.',[]).some(x=>x.name==='Accounting'));
});
test('equivalent duplicate records collapse to one',()=>{
 const {p}=rig();p.skills.data.push({...p.skills.data[0],id:crypto.randomUUID()});
 const s=n.prepareNaturalComposition(p,referenceJob).source;
 a.equal(explicitSkillCoverage(p,s,'Required skills: Accounting.',[]).filter(x=>x.name==='Accounting').length,1);
});
test('the tailored copy retains original qualifications and never creates missing skills or experience',()=>{
 const {p}=rig(),before=JSON.stringify(p),job='Fictional role for a small organization.\nRequired skills: Accounting, Bookkeeping, Excel, Kubernetes.';
 const s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const raw={summarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:e.overviewId?{text:f.get(e.overviewId),sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))})),skillSelections:[{id:'skill_4',category:'Technical'}]};
 const out=n.compileNaturalComposition(p,raw,job);
 a.deepEqual(out.candidate.skills.data.map(x=>x.name),['Budgeting','Accounting','Bookkeeping','Excel']);
 a.deepEqual(out.candidate.skills.data.slice(1),p.skills.data.slice(0,3));
 a.deepEqual(out.candidate.experience,p.experience);a.equal(JSON.stringify(p),before);
 a.equal(out.guardNotes.filter(x=>x.path==='skillSelections'&&x.message.includes('literal match')).length,3);
});

test('exact lists work for several non-programming fields without implying practice',()=>{
 for(const name of ['Nursing','Recruitment','Photography','Inventory','Budgeting']){
  const {p}=rig();p.skills.data=[{id:crypto.randomUUID(),name,category:'Technical',level:'Beginner'}];
  const s=n.prepareNaturalComposition(p,referenceJob).source;
  const added=explicitSkillCoverage(p,s,`Required skills: ${name}.`,[]);
  a.equal(added.length,1,name);a.equal(added[0].name,name);
 }
});
test('a non-Latin list item is not automatically matched by the new English-only rule',()=>{
 const {p}=rig();p.skills.data=[{id:crypto.randomUUID(),name:'محاسبة',category:'Technical',level:''}];
 const s=n.prepareNaturalComposition(p,referenceJob).source;
 a.deepEqual(explicitSkillCoverage(p,s,'Required skills: محاسبة.',[]),[]);
});
test('contradictory mentions are recognized for punctuation in exact native labels',()=>{
 const {p}=rig();p.skills.data=[{id:crypto.randomUUID(),name:'C++',category:'Languages',level:'Beginner'},{id:crypto.randomUUID(),name:'Excel',category:'Tools',level:''}];
 const s=n.prepareNaturalComposition(p,referenceJob).source;
 const added=explicitSkillCoverage(p,s,'Required skills: C++, Excel.\nC++ is prohibited.',[]);
 a(!added.some(x=>x.name==='C++'));a(added.some(x=>x.name==='Excel'));
});
