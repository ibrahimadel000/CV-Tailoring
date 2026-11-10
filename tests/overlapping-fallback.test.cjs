// Fictional compiler regression tests; no provider request.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
function run(bullets){
 const p=fixture(),before=JSON.stringify(p),s=n.prepareNaturalComposition(p,job).source;
 const wire={summarySegments:[],alternativeSummarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets})),skillSelections:[]};
 const out=n.compileNaturalComposition(p,wire,job);assert.equal(JSON.stringify(p),before);return {p,out,texts:out.candidate.experience.data[0].bullets.map(b=>b.text)};
}
test('a rejected split line does not duplicate an accepted rewrite of the same source',()=>{
 const {p,out,texts}=run([{text:'Developed web applications and technical architectures.',sourceIds:['work_1_b1']},{text:'Built web applications using Kubernetes.',sourceIds:['work_1_b1']},{text:'Reduced technical overhead by improving delivery workflows.',sourceIds:['work_1_b2']},{text:'Delivered technical onboarding workshops.',sourceIds:['work_1_b3']}]);
 assert.deepEqual(texts,[p.experience.data[0].bullets[0].text,'Reduced technical overhead by improving delivery workflows.','Delivered technical onboarding workshops.']);
 assert(out.guardNotes.some(x=>x.message.includes('overlap')));
});
test('a rejected line restores all connected source facts but preserves independent edits',()=>{
 const {p,texts}=run([{text:'Developed web applications and improved delivery workflows.',sourceIds:['work_1_b1','work_1_b2']},{text:'Built web applications using Kubernetes.',sourceIds:['work_1_b1']},{text:'Conducted technical onboarding workshops.',sourceIds:['work_1_b3']}]);
 assert.deepEqual(texts,[p.experience.data[0].bullets[0].text,p.experience.data[0].bullets[1].text,'Conducted technical onboarding workshops.']);
});
test('valid split lines that share one source are not collapsed',()=>{
 const {texts}=run([{text:'Built web applications.',sourceIds:['work_1_b1']},{text:'Designed technical architectures.',sourceIds:['work_1_b1']},{text:'Improved delivery workflows and reduced technical overhead.',sourceIds:['work_1_b2']}]);
 assert.deepEqual(texts,['Built web applications.','Designed technical architectures.','Improved delivery workflows and reduced technical overhead.']);
});
test('restoration works if the rejected line comes before the valid line',()=>{
 const {p,texts}=run([{text:'Built web applications using Kubernetes.',sourceIds:['work_1_b1']},{text:'Developed web applications and technical architectures.',sourceIds:['work_1_b1']},{text:'Conducted technical onboarding workshops.',sourceIds:['work_1_b3']}]);
 assert.deepEqual(texts,[p.experience.data[0].bullets[0].text,'Conducted technical onboarding workshops.']);
});
test('restoration closes transitive overlaps without losing cited facts',()=>{
 const {p,texts}=run([{text:'Improved delivery workflows and delivered technical onboarding.',sourceIds:['work_1_b2','work_1_b3']},{text:'Developed web applications and improved delivery workflows.',sourceIds:['work_1_b1','work_1_b2']},{text:'Built web applications using Kubernetes.',sourceIds:['work_1_b1']}]);
 assert.deepEqual([...texts].sort(),p.experience.data[0].bullets.map(b=>b.text).sort());
});
