// Authored offline examples; no model-quality verdict or live call.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const {renderSummaryCapabilities}=load('services/resumeComposer/summaryCapabilities');
function response(p,ids=['skill_1','skill_2']){
 const s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x]));
 return {summarySegments:p.summary.isLocked?[]:[{text:'Software engineer with a background in web applications and delivery workflow improvement.',sourceIds:['work_1_b1','work_1_b2']}],
 summaryCapabilityIds:ids,entries:s.experience.filter(()=>!s.locks.experience).map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id).text,sourceIds:[id]}))})),
 skillSelections:p.skills.isLocked?[]:['skill_1','skill_2','skill_3','skill_4','skill_5'].map(id=>({id,category:'Technical'}))};
}
test('SC4 renders source-bound capabilities without free-text proficiency or employer claims',()=>{
 const p=fixture();p.skills.data[0].level='Coursework only';const before=JSON.stringify(p);
 const out=n.compileNaturalComposition(p,response(p));
 a(out.candidate.summary.data.endsWith('Relevant skills: Python — Coursework only; RESTful APIs.'));
 a.deepEqual(out.summaryCapabilityIds,['skill_1','skill_2']);a.deepEqual(out.summaryRemovals,[]);
 a.deepEqual(out.candidate.experience,p.experience);a.equal(JSON.stringify(p),before);
 a.equal(out.semanticStatus,'unassessed');a(!out.candidate.summary.data.includes('using Python'));
 a.deepEqual(out.draft.summary.sourceIds,['work_1_b1','work_1_b2','skill_1','skill_2']);
});
for(const [label,ids] of [['duplicate',['skill_1','skill_1']],['unknown',['skill_999']],['non-skill',['work_1_b1']],['unselected',['skill_7']],['too many',['skill_1','skill_2','skill_3','skill_4','skill_5']],['equivalent',['skill_4','skill_5']]])
 test('SC4 rejects '+label+' capability selections before changing the original',()=>{const p=fixture(),before=JSON.stringify(p);a.throws(()=>n.compileNaturalComposition(p,response(p,ids)));a.equal(JSON.stringify(p),before)});
test('SC4 cannot introduce free-text fields in the capability channel',()=>{const p=fixture(),r=response(p);r.summaryCapabilityIds=[{id:'skill_1',text:'Expert Python API developer'}];a.throws(()=>n.compileNaturalComposition(p,r))});
test('SC4 honors both summary locks and independently locked skills',()=>{
 const p=fixture();p.summary.isLocked=true;const r=response(p);a.throws(()=>n.compileNaturalComposition(p,r),/Locked summary/);
 r.summaryCapabilityIds=[];a.deepEqual(n.compileNaturalComposition(p,r).candidate.summary,p.summary);
 p.summary.isLocked=false;p.skills.isLocked=true;const out=n.compileNaturalComposition(p,response(p));a.deepEqual(out.candidate.skills,p.skills);a(out.candidate.summary.data.includes('Relevant skills: Python'));
});
test('SC4 preserves original capability-group qualification instead of inferring practice',()=>{
 const s=n.prepareNaturalComposition(fixture(),job).source;
 s.originalSkillContexts=[{sectionTitle:'Technical Skills',groupTitle:'Classroom only',skillIds:['skill_1']}];
 const out=renderSummaryCapabilities(s,['skill_1'],['skill_1']);a.equal(out.text,'Relevant skills: Python [Technical Skills / Classroom only].');
});
test('SC4 retains skill-inflation filtering for freely authored narrative',()=>{
 const p=fixture(),r=response(p);r.summarySegments=[{text:'Expert building production RESTful APIs using Python.',sourceIds:['skill_1','skill_2']}];
 const out=n.compileNaturalComposition(p,r);a.equal(out.candidate.summary.data,'Relevant skills: Python; RESTful APIs.');a.equal(out.summaryRemovals.length,1);
 a(!out.candidate.summary.data.includes('Expert'));a(!out.candidate.summary.data.includes('production'));
});
test('SC4 includes capability rendering in the total summary character budget',()=>{
 const p=fixture(),r=response(p);r.summarySegments=[{text:'a'.repeat(2390),sourceIds:['work_1_b1']}];a.throws(()=>n.compileNaturalComposition(p,r),/Joined summary/);
});
test('SC4 requires capability field in provider schema, while old offline responses replay without it',()=>{
 const p=fixture(),packet=n.prepareNaturalComposition(p,job);a(packet.outputContract.required.includes('summaryCapabilityIds'));
 a.equal(n.googleNaturalSchema(packet).properties.summaryCapabilityIds.type,'ARRAY');
 const r=response(p,[]);delete r.summaryCapabilityIds;a.equal(n.compileNaturalComposition(p,r).summaryCapabilityIds.length,0);
});
