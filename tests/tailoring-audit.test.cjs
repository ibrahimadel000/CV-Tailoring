// Offline fictional evaluation: literal matching is not semantic verification.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const c=load('services/resumeComposer/explicitSkillCoverage');
function skill(p,name,level=''){p.skills.data.push({id:crypto.randomUUID(),name,category:'Technical',level});return `skill_${p.skills.data.length}`;}
function additions(p,job,selected=[]){const source=n.prepareNaturalComposition(p,"A sufficiently long offline test job description.").source;return c.explicitSkillCoverage(p,source,job,selected);}
function profile(){const p=fixture();p.skills.data=[];return p;}
test('an exact multiword source skill is available for a hyphenated job requirement',()=>{const p=profile();const id=skill(p,'Problem Solving & Algorithm Design','Coursework only');let xs=additions(p,'Requirements: strong problem-solving and technical communication skills.');a.equal(xs.length,1);a.equal(xs[0].id,id);a.equal(xs[0].name,p.skills.data[0].name);});
test('matching phrase is not taken from a negated or contradicted requirement',()=>{const p=profile();skill(p,'Problem Solving & Algorithm Design');for(const job of ['No problem-solving is required.','Problem solving is preferred; problem solving is not required.','Without problem-solving duties.'])a.equal(additions(p,job).length,0,job);});
test('a shared phrase is ambiguous and cannot choose between skill records',()=>{const p=profile();skill(p,'Problem Solving & Algorithm Design');skill(p,'Problem Solving in Teams');a.equal(additions(p,'Strong problem-solving is required.').length,0);});
test('phrase matching cannot invent skills, match fragments or use common filler phrases',()=>{const p=profile();skill(p,'Leadership and Communication');skill(p,'Strong Team Skills');for(const j of ['Leadership is required and communication is a plus.','Kubernetes debugging is required.','Strong team skills are expected.'])a.equal(additions(p,j).length,0,j);});
test('locked, already selected and unrelated source skills are unchanged',()=>{const p=profile();const id=skill(p,'Technical Documentation','Beginner');skill(p,'Watercolor Painting');a.equal(additions(p,'Write technical documentation.',[{id,category:'Technical'}]).length,0);p.skills.isLocked=true;a.equal(additions(p,'Write technical documentation.').length,0);});
test('compiled result retains exact qualified skill and does not invent experience',()=>{
 const p=fixture();p.skills.data=[];const id=skill(p,'Problem Solving & Algorithm Design','Coursework only');const j='The ideal candidate has strong problem-solving and technical communication skills.';
 const s=n.prepareNaturalComposition(p,j).source,m=new Map(s.evidence.map(x=>[x.id,x]));
 const raw={summarySegments:[],alternativeSummarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(k=>({text:m.get(k).text,sourceIds:[k]}))})),skillSelections:[]};
 const before=JSON.stringify(p),out=n.compileNaturalComposition(p,raw,j);
 a.deepEqual(out.candidate.skills.data,[]);a.deepEqual(out.candidate.experience,p.experience);a.equal(JSON.stringify(p),before);a(out.warnings.some(w=>w.message.includes('problem solving')&&w.message.includes('Optional skill suggestion')));a.equal(id,'skill_1');
});
test('word fragments and unmatched international words do not create skills',()=>{const p=profile();skill(p,'Data Analysis');skill(p,'تحليل البيانات');for(const j of ['Seeking metadata analyst expertise for our team.','Seeking data analysts with forecasting experience.','القدرة على معالجة المعلومات والعمل ضمن الفريق مطلوب'])a.equal(additions(p,j).length,0);});
test('negated acronyms and phrase references suppress restoration',()=>{const p=profile();skill(p,'Cloud Platform Administration');for(const j of ["Cloud platform administration isn't required.","We don't require cloud platform administration.","Cloud platform administration is optional."])a.equal(additions(p,j).length,0,j);});
test('non-English phrase matching is declined because negation is English-only',()=>{const p=profile();skill(p,'تحليل البيانات');a.deepEqual(additions(p,'لا نحتاج إلى تحليل البيانات لهذا المنصب.'),[]);});
test('curly apostrophe negation suppresses phrase matching',()=>{const p=profile();skill(p,'Cloud Platform Administration');a.deepEqual(additions(p,'Cloud platform administration isn’t required.'),[]);});
test('partial word overlap and separated words do not count as an exact phrase',()=>{const p=profile();skill(p,'Problem Solving & Algorithm Design');for(const j of ['Investigate problems by solving incidents.','Problem investigation and independently solving technical incidents.'])a.equal(additions(p,j).length,0,j);});
