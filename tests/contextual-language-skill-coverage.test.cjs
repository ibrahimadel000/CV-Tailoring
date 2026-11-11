// Synthetic scenarios: exact native skill retention is not a relevance or proficiency verdict.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {explicitSkillCoverage}=load('services/resumeComposer/explicitSkillCoverage');
function rig(){
 const p=fixture();p.skills.data=[
  {id:crypto.randomUUID(),name:'Python',category:'Languages',level:'Coursework only'},
  {id:crypto.randomUUID(),name:'Java',category:'Technical',level:'Beginner'},
  {id:crypto.randomUUID(),name:'PHP',category:'Technical',level:''},
 ];
 const s=n.prepareNaturalComposition(p,'Fictional software role involving internal applications and collaborative delivery.').source;
 return {p,s,add:(job,selected=[])=>explicitSkillCoverage(p,s,job,selected)};
}
for(const [job,expected] of [
 ['Build software using Python.',['Python']],
 ['We need Python development for this position.',['Python']],
 ['Work on Python programming and Java development.',['Python','Java']],
 ['Build software with Java.',['Java']],
 ['Seeking a PYTHON developer.',['Python']],
]) test('retains a listed language in explicit programming context: '+job,()=>{
 const {add}=rig();a.deepEqual(add(job).map(x=>x.name),expected);
});
for(const job of [
 'Care for Python snakes in the exhibit.',
 'Serve Java coffee at the cafe.',
 'We use Python and Kubernetes for technical management work.',
 'Python programming is not required.',
 'Python development is optional.',
 'Python development is prohibited for this role.',
 'Python development is required.\nPython programming is forbidden.',
 'No experience with Python is needed; Python development is available.',
 'Python development is needed. لا نحتاج إلى Python.',
 'لا نحتاج إلى Python development.',
 'Maintain non-Python development tools.',
 'Maintain Python.js development tools.',
 'Python development is required.\nExcluding Python programming.',
 'Python development is required.\nUse non-Python tools instead.',
]) test('does not auto-retain a language from ambiguous or negative context: '+job,()=>{
 const {add}=rig();a(!add(job).some(x=>x.name==='Python'||x.name==='Java'));
});
test('keeps exact native qualification and leaves experience and original untouched',()=>{
 const {p}=rig(),before=JSON.stringify(p),job='Build software using Python and support Java development.';
 const s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const raw={summarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:e.overviewId?{text:f.get(e.overviewId),sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))})),skillSelections:[{id:'skill_3',category:'Technical'}]};
 const out=n.compileNaturalComposition(p,raw,job);
 a.deepEqual(out.candidate.skills.data.map(x=>x.name),['PHP','Python','Java']);
 a.deepEqual(out.candidate.skills.data[1],p.skills.data[0]);
 a.deepEqual(out.candidate.skills.data[2],p.skills.data[1]);
 a.deepEqual(out.candidate.experience,p.experience);
 a(out.guardNotes.filter(x=>x.path==='skillSelections'&&x.message.includes('literal match')).length===2);
 a.equal(JSON.stringify(p),before);
});
test('does not fabricate a missing skill, select a combined label, or duplicate a selected skill',()=>{
 const {p,s,add}=rig();a(!add('Python development uses Kubernetes.').some(x=>x.name==='Kubernetes'));
 a(!add('Python development.',[{id:'skill_1',category:'Languages'}]).some(x=>x.name==='Python'));
 p.skills.data[0].name='Python (Django)';const source=n.prepareNaturalComposition(p,'Fictional software role involving internal applications and collaborative delivery.').source;
 a(!explicitSkillCoverage(p,source,'Python development.',[]).some(x=>x.id==='skill_1'));
});
test('duplicate labels with distinct qualifications are ambiguous',()=>{
 const {p}=rig();p.skills.data.push({id:crypto.randomUUID(),name:'Python',category:'Languages',level:'Advanced'});
 const s=n.prepareNaturalComposition(p,'Fictional software role involving internal applications and collaborative delivery.').source;
 a(!explicitSkillCoverage(p,s,'Python development.',[]).some(x=>x.name==='Python'));
});
test('exact duplicate skill records are not duplicated and locks stay respected',()=>{
 const {p}=rig();p.skills.data.push({...p.skills.data[0],id:crypto.randomUUID()});
 let s=n.prepareNaturalComposition(p,'Fictional software role involving internal applications and collaborative delivery.').source;
 a.equal(explicitSkillCoverage(p,s,'Python development.',[]).filter(x=>x.name==='Python').length,1);
 p.skills.isLocked=true;s=n.prepareNaturalComposition(p,'Fictional software role involving internal applications and collaborative delivery.').source;
 a.deepEqual(explicitSkillCoverage(p,s,'Python development.',[]),[]);
});

test('an all-caps native language cannot bypass a contradictory contextual mention via the acronym rule',()=>{
 const {p}=rig();p.skills.data[0].name='PYTHON';
 const s=n.prepareNaturalComposition(p,'Fictional software role involving internal applications and collaborative delivery.').source;
 a(!explicitSkillCoverage(p,s,'Python development is required.\nExcluding Python programming.',[]).some(x=>x.id==='skill_1'));
});
