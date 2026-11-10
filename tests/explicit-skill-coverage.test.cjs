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
test('job-listed SaaS restores only the existing qualified skill; no implied experience',()=>{
 const p=profile(), before=JSON.stringify(p), out=n.compileNaturalComposition(p,response(p),job);
 const restored=out.candidate.skills.data.find(s=>s.name==='Full-Stack SaaS Architecture');
 a.deepEqual(restored,p.skills.data[0]);a.equal(restored.level,'Coursework only');
 a(out.guardNotes.some(note=>note.path==='skillSelections'&&note.message.includes('literal match')));
 a.equal(JSON.stringify(p),before);a(!out.candidate.skills.data.some(s=>s.name==='AI Automation'));
 a.deepEqual(out.candidate.experience,p.experience,'skill restoration must never write experience');
});
test('matching is case-insensitive but token-boundary exact',()=>{
 const p=profile(),s=plan(p);a(coverage.explicitSkillCoverage(p,s,'A SaaS platform engineer with relevant experience.',[]).some(x=>x.id==='skill_1'));
 a(coverage.explicitSkillCoverage(p,s,'A saas platform engineer with relevant experience.',[]).some(x=>x.id==='skill_1'));
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
