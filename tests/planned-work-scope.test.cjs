// Fictional offline cases. Literal English signals do not verify meaning.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
function compile(sourceText,proposed) {
 const p=fixture();p.experience.data[0].bullets[0].text=sourceText;
 const before=JSON.stringify(p),s=n.prepareNaturalComposition(p,job).source,facts=new Map(s.evidence.map(x=>[x.id,x.text]));
 const raw={summarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map((id,i)=>({text:i?facts.get(id):proposed,sourceIds:[id]}))})),skillSelections:[]};
 const out=n.compileNaturalComposition(p,raw,job);assert.equal(JSON.stringify(p),before);
 return {out,actual:out.candidate.experience.data[0].bullets[0].text};
}
for(const [source,proposal] of [
 ['Planned to deploy web applications.','Deployed web applications.'],
 ['Intended to automate delivery workflows.','Automated delivery workflows.'],
 ['Aimed to improve delivery workflows.','Improved delivery workflows.'],
 ['Plans to develop web applications.','Developed web applications.'],
]) test('does not silently turn intended activity into completed work: '+source,()=>{
 const {out,actual}=compile(source,proposal);assert.equal(actual,source);
 assert(out.guardNotes.some(n=>n.kind==='restored'&&n.path==='entries.work_1.bullets.0'&&n.message.includes('planned or intended')));
});
test('explicitly retained intent remains eligible for editing',()=>{
 const source='Planned to deploy web applications after testing.';
 assert.equal(compile(source,'After testing, planned to deploy web applications.').actual,'After testing, planned to deploy web applications.');
});
test('moving a plan to a different action restores the original',()=>{
 const source='Planned to deploy web applications and tested delivery workflows.';
 const {out,actual}=compile(source,'Deployed web applications and planned to test delivery workflows.');
 assert.equal(actual,source);
 assert(out.guardNotes.some(x=>x.message.includes('planned or intended action')));
});
test('a synonymous planned-action verb may conservatively restore the original',()=>{
 const source='Planned to deploy web applications.';
 assert.equal(compile(source,'Planned to release web applications.').actual,source);
});
test('actual planning work is not treated as an uncompleted activity',()=>{
 const source='Planned the deployment of web applications.';
 assert.equal(compile(source,'Planned web application deployment.').actual,'Planned web application deployment.');
});
test('planning used as a noun does not invent an intention',()=>{
 const source='Aligned clinic schedules through cross-team coordination and planning.';
 const proposed='Coordinated cross-team planning to align clinic schedules.';
 assert.equal(compile(source,proposed).actual,proposed);
});
test('the literal check does not claim to cover the ambiguous phrase planning to',()=>{
 const {scopeRisk}=load('services/resumeComposer/scopeRisk');
 assert(!scopeRisk('Deployed web applications.',['Planning to deploy web applications.']).some(x=>x.includes('planned or intended')));
});
test('an invented future plan is not added to completed work',()=>{
 const source='Deployed web applications.';
 const {out,actual}=compile(source,'Plans to deploy web applications.');
 assert.equal(actual,source);assert(out.guardNotes.some(x=>x.message.includes('planned or intended action')));
});
test('an unchanged original remains untouched',()=>{
 const source='Planned to deploy web applications.';assert.equal(compile(source,source).actual,source);
});
test('the narrow signal may conservatively restore even if both plan and completion appear in one source',()=>{
 const source='Planned to deploy web applications and then deployed them.';
 assert.equal(compile(source,'Planned and deployed web applications.').actual,source);
});
test('a summary cannot silently turn planned work into completed work',()=>{
 const p=fixture();p.experience.data[0].bullets[0].text='Planned to deploy web applications.';
 const s=n.prepareNaturalComposition(p,job).source,facts=new Map(s.evidence.map(x=>[x.id,x.text]));
 const raw={summarySegments:[{text:'Deployed web applications for the team.',sourceIds:['work_1_b1']}],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:facts.get(id),sourceIds:[id]}))})),skillSelections:[]};
 const out=n.compileNaturalComposition(p,raw,job);
 assert(out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.kind==='removed'&&x.message.includes('planned or intended')));
});
