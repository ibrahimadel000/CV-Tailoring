// Synthetic offline tests: matching is a limited recall safeguard, not proof of job fit.
const {test}=require('node:test'), a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const coverage=load('services/resumeComposer/explicitSkillCoverage');
const job='Backend engineer requirements: PHP, MySQL, and APIs. Preferred: SaaS applications and documentation.';
function profile(){const p=fixture();p.skills.data=[
 {id:crypto.randomUUID(),name:'Full-Stack SaaS Architecture',category:'Technical',level:'Coursework only'},
 {id:crypto.randomUUID(),name:'Python',category:'Languages',level:''},
 {id:crypto.randomUUID(),name:'PHP (Laravel, Custom MVC)',category:'Technical',level:''},
 {id:crypto.randomUUID(),name:'AI Automation',category:'Technical',level:''},
];return p;}
function plan(p,j=job){return n.prepareNaturalComposition(p,j).source;}
function response(p,j=job){const s=plan(p,j),m=new Map(s.evidence.map(x=>[x.id,x]));return {summarySegments:[],entries:s.experience.filter(()=>!s.locks.experience).map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:m.get(id).text,sourceIds:[id]}))})),skillSelections:[{id:'skill_3',category:'Technical'}]};}
test('partial SaaS mention prompts review but does not automatically restore a compound skill',()=>{
 const p=profile(), before=JSON.stringify(p), out=n.compileNaturalComposition(p,response(p),job);
 const restored=out.candidate.skills.data.find(s=>s.name==='Full-Stack SaaS Architecture');
 a.equal(restored,undefined);
 a(out.guardNotes.some(note=>note.path==='skillSelections'&&note.message.toLowerCase().includes('possible partial')&&note.message.includes('Coursework only')));
 a.equal(JSON.stringify(p),before);a(!out.candidate.skills.data.some(s=>s.name==='AI Automation'));
 a.deepEqual(out.candidate.experience,p.experience,'skill restoration must never write experience');
});
test('compound full-label matching is case-insensitive and boundary exact',()=>{
 const p=profile(),s=plan(p);for(const job of ['Full-Stack SaaS Architecture','full-stack saas architecture'])a(coverage.explicitSkillCoverage(p,s,job,[]).some(x=>x.id==='skill_1'));
 a(!coverage.explicitSkillCoverage(p,s,'Experience with supersaas platforms is helpful.',[]).some(x=>x.id==='skill_1'));
});
test('negative or contradictory mentions do not trigger coverage',()=>{
 const p=profile(),s=plan(p);
 for(const j of ['No SaaS experience is required for this position.','Do not use SaaS in this role.','SaaS is not required.','SaaS skills are optional, not required.','SaaS is preferred. No SaaS experience required.'])
  a(!coverage.explicitSkillCoverage(p,s,j,[]).some(x=>x.id==='skill_1'),j);
});
test('ambiguous shared acronyms, selected skills, locked skills and empty job are untouched',()=>{
 const p=profile();p.skills.data.push({id:crypto.randomUUID(),name:'SaaS security basics',category:'Technical',level:'Beginner'});let s=plan(p);
 a(!coverage.explicitSkillCoverage(p,s,job,[]).some(x=>x.id==='skill_1'||x.id==='skill_5'));
 p.skills.data.pop();s=plan(p);a(!coverage.explicitSkillCoverage(p,s,job,[{id:'skill_1',category:'Technical'}]).some(x=>x.id==='skill_1'));
 a.deepEqual(coverage.explicitSkillCoverage(p,s,'',[]),[]);
 p.skills.isLocked=true;s=plan(p);a.deepEqual(coverage.explicitSkillCoverage(p,s,job,[]),[]);
});
test('ordinary job words and unsupported missing skills are not fabricated',()=>{
 const p=profile(),s=plan(p);const result=coverage.explicitSkillCoverage(p,s,'We use Python and Kubernetes for technical management work.',[]);
 a(!result.some(x=>x.id==='skill_2'),'single initial capital is not a distinctive token');
 a(!result.some(x=>x.name.includes('Kubernetes')));
});
test('exact duplicate skills in equivalentSkillSets do not self-collide on distinctive job phrases',()=>{
 const p=profile();
 p.skills.data.push(
  {id:crypto.randomUUID(),name:'Technical Documentation',category:'Technical',level:''},
  {id:crypto.randomUUID(),name:'Technical Documentation',category:'Technical',level:''},
 );
 const j='Backend engineer requirements: PHP, MySQL, and APIs. Write clear technical documentation.';
 const s=plan(p,j);
 const added=coverage.explicitSkillCoverage(p,s,j,[{id:'skill_3',category:'Technical'}]);
 const docMatches=added.filter(x=>x.name==='Technical Documentation');
 a.equal(docMatches.length,1,'must retain exactly one representative of the duplicate skill');
 a.equal(docMatches[0].id,'skill_5');
 // If the second duplicate is already selected, do not add the first duplicate
 const whenSecondSelected=coverage.explicitSkillCoverage(p,s,j,[{id:'skill_3',category:'Technical'},{id:'skill_6',category:'Technical'}]);
 a(!whenSecondSelected.some(x=>x.name==='Technical Documentation'));
});

for(const phrase of ['AWS is prohibited', 'AWS is forbidden', 'AWS should be avoided', 'excluding AWS', 'non-AWS systems'])test('negative token does not restore a prohibited skill: '+phrase,()=>{
 const p=profile();p.skills.data.push({id:crypto.randomUUID(),name:'AWS',category:'Tools',level:''});const s=plan(p);
 for(const job of [`We operate cloud services. ${phrase}.`, `Required skills: AWS\n${phrase}.`])a(!coverage.explicitSkillCoverage(p,s,job,[]).some(x=>x.name==='AWS'),job);
});

test('SQL token does not restore a different qualified compound label',()=>{
 const p=profile();p.skills.data=[{id:crypto.randomUUID(),name:'SQL Injection',category:'Technical',level:'Awareness only'}];const s=plan(p);const result=coverage.analyzeSkillCoverage(p,s,'We require SQL database administration.',[]);
 a.deepEqual(result.additions,[]);a.deepEqual(result.partials,[{id:'skill_1',name:'SQL Injection',level:'Awareness only'}]);
});
test('full compound label may be restored but contradictory mentions block it',()=>{
 const p=profile();p.skills.data=[{id:crypto.randomUUID(),name:'SQL Injection',category:'Technical',level:'Awareness only'}];const s=plan(p);
 a.equal(coverage.explicitSkillCoverage(p,s,'We require SQL Injection awareness.',[]).length,1);
 for(const j of ['SQL Injection is prohibited.','SQL Injection is preferred; SQL Injection is forbidden.','non-SQL Injection work only.'])a.deepEqual(coverage.explicitSkillCoverage(p,s,j,[]),[]);
});
test('compound partial suggestions respect locks and selected skills',()=>{
 const p=profile(),s=plan(p);a.equal(coverage.analyzeSkillCoverage(p,s,'We use SaaS products.',[{id:'skill_1',category:'Technical'}]).partials.length,0);
 p.skills.isLocked=true;a.deepEqual(coverage.analyzeSkillCoverage(p,plan(p),'We use SaaS products.',[]),{additions:[],partials:[]});
});

test('a negative unrelated sentence does not suppress a separate positive skill mention',()=>{
 const p=profile();p.skills.data=[{id:crypto.randomUUID(),name:'AWS',category:'Tools',level:''}];const s=plan(p);a.equal(coverage.explicitSkillCoverage(p,s,'AWS is required. Overtime is prohibited.',[]).length,1);
});
