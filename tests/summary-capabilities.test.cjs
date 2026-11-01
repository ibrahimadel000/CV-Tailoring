// Regression for the deliberately retired SC4 append path, NOT writing acceptance.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const {renderSummaryCapabilities}=load('services/resumeComposer/summaryCapabilities');
function response(p,ids=[]){
 const s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x]));
 return {summarySegments:p.summary.isLocked?[]:[{text:'Software engineer with a background in web applications and delivery workflow improvement.',sourceIds:['work_1_b1','work_1_b2']}],
 summaryCapabilityIds:ids,entries:s.experience.filter(()=>!s.locks.experience).map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id).text,sourceIds:[id]}))})),
 skillSelections:p.skills.isLocked?[]:['skill_1','skill_2','skill_3','skill_4','skill_5'].map(id=>({id,category:'Technical'}))};
}
test('selected capabilities retain exact levels in Skills without an automatic summary append',()=>{
 const p=fixture();p.skills.data[0].level='Coursework only';const before=JSON.stringify(p),out=n.compileNaturalComposition(p,response(p));
 a.equal(out.candidate.summary.data,response(p).summarySegments[0].text);
 a.equal(out.candidate.skills.data.find(s=>s.name==='Python').level,'Coursework only');
 a.deepEqual(out.summaryCapabilityIds,[]);a.deepEqual(out.summaryRemovals,[]);a.deepEqual(out.candidate.experience,p.experience);a.equal(JSON.stringify(p),before);a.equal(out.semanticStatus,'unassessed');
});
for(const [label,ids] of [['old valid',['skill_1']],['duplicate',['skill_1','skill_1']],['unknown',['skill_999']],['non-skill',['work_1_b1']],['unselected',['skill_7']],['too many',['skill_1','skill_2','skill_3','skill_4','skill_5']],['equivalent',['skill_4','skill_5']]])
 test('retired summary capability channel rejects '+label+' nonempty selections before save',()=>{const p=fixture(),before=JSON.stringify(p);a.throws(()=>n.compileNaturalComposition(p,response(p,ids)));a.equal(JSON.stringify(p),before)});
test('retired renderer cannot strip qualifications or emit taxonomy even when directly invoked',()=>{
 const s=n.prepareNaturalComposition(fixture(),job).source;s.originalSkillContexts=[{sectionTitle:'Technical Skills',groupTitle:'Classroom only',skillIds:['skill_1']}];
 a.throws(()=>renderSummaryCapabilities(s,['skill_1'],['skill_1']),/retired/);a.deepEqual(renderSummaryCapabilities(s,[],[]),{text:'',sourceIds:[]});
});
test('provider schema no longer requests a summary capability field; empty legacy payload remains readable',()=>{
 const p=fixture(),packet=n.prepareNaturalComposition(p,job);a(!packet.outputContract.required.includes('summaryCapabilityIds'));a(!('summaryCapabilityIds' in n.googleNaturalSchema(packet).properties));
 const r=response(p);delete r.summaryCapabilityIds;a.equal(n.compileNaturalComposition(p,r).summaryCapabilityIds.length,0);
});
test('summary and skill locks remain independent and byte-preserved',()=>{
 const p=fixture();p.summary.isLocked=true;p.skills.isLocked=true;const out=n.compileNaturalComposition(p,response(p));a.deepEqual(out.candidate.summary,p.summary);a.deepEqual(out.candidate.skills,p.skills);
});
