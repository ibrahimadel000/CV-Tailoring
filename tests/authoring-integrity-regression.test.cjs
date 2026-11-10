// Offline fictional regressions. Passing checks do not establish semantic truth or live model quality.
const {test}=require('node:test'), assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {createCompositionRunner}=load('services/resumeComposer/workflow');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const b1='Designed and engineered event scheduling applications and technical architectures for local volunteer groups.';
const b2='Organized project delivery checklists and wrote technical documentation for internal teams.';
const echo='Software Engineer experienced in designing and engineering event scheduling applications and technical architectures.';
const second='Also delivered technical onboarding workshops.';
function setup(){
 const p=fixture(); p.headline.data='Software Engineer'; p.resumeHeader.data.desiredJobPosition='Software Engineer';
 p.experience.data[0].bullets=[b1,b2,'Delivered technical onboarding workshops.'].map(text=>({id:crypto.randomUUID(),text,isVerified:true}));
 const s=n.prepareNaturalComposition(p,job).source, facts=new Map(s.evidence.map(f=>[f.id,f]));
 return {p,r:{summarySegments:[{text:echo,sourceIds:['headline','work_1_b1']},{text:second,sourceIds:['work_1_b3']}],alternativeSummarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:facts.get(id).text,sourceIds:[id]}))})),skillSelections:s.skillIds.map(id=>({id,category:'Technical'}))}};
}
test('a surviving echoed sentence in a multi-sentence summary is flagged without deleting the other sentence',()=>{
 const {p,r}=setup(),out=n.compileNaturalComposition(p,r,job);
 assert.equal(out.candidate.summary.data,`${echo} ${second}`);
 assert(out.warnings.some(w=>w.path==='summary' && /closely echoes/i.test(w.message)));
 assert.equal(out.semanticStatus,'unassessed');
});
test('an uncited source contribution is disclosed, not silently deleted or automatically fabricated',()=>{
 const {p,r}=setup();r.entries[0].bullets.splice(1,1);
 const out=n.compileNaturalComposition(p,r,job);
 assert.deepEqual(out.candidate.experience.data[0].bullets.map(b=>b.text),[b1,'Delivered technical onboarding workshops.']);
 assert(out.warnings.some(w=>w.path==='entries.work_1' && /1 original.*passage/i.test(w.message) && /not cited/i.test(w.message)));
});
test('a combined rewrite citing both source passages is not reported as an uncited omission',()=>{
 const {p,r}=setup();r.entries[0].bullets=[{text:'Built event scheduling applications and organized project delivery checklists.',sourceIds:['work_1_b1','work_1_b2']},r.entries[0].bullets[2]];
 const out=n.compileNaturalComposition(p,r,job);
 assert(!out.warnings.some(w=>w.path==='entries.work_1' && /not cited/i.test(w.message)));
});
test('omission disclosure survives in a new copy while the original stays untouched',async()=>{
 const {p,r}=setup(), before=JSON.stringify(p);r.entries[0].bullets.splice(1,1);let active=p,calls=0;
 const runner=createCompositionRunner({readActive:()=>active,appendIfCurrent:(snap,copy)=>{assert.equal(snap,before);active=copy;return true}},async()=>{calls++;return r});
 const out=await runner.run(job,new AbortController().signal);
 assert.equal(out.status,'created');assert.equal(calls,1);assert.equal(JSON.stringify(p),before);
 assert(active.compositionReview.notes.some(note=>/1 original.*passage/i.test(note)&&/not cited/i.test(note)));
});
test('an uncited project passage is reported; locked projects are not',()=>{
 const {p}=setup();p.projects.isLocked=false;p.projects.data=[{id:crypto.randomUUID(),name:'Example project',role:'Contributor',url:'',bullets:[{id:crypto.randomUUID(),text:'Built a local prototype.',isVerified:true},{id:crypto.randomUUID(),text:'Documented the prototype.',isVerified:true}]}];
 const s=n.prepareNaturalComposition(p,job).source, m=new Map(s.evidence.map(f=>[f.id,f.text]));
 const r={summarySegments:[],alternativeSummarySegments:[],entries:[...s.experience,...s.projects].map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.slice(0,1).map(id=>({text:m.get(id),sourceIds:[id]}))})),skillSelections:[]};
 const out=n.compileNaturalComposition(p,r,job);
 assert(out.warnings.some(w=>w.path==='entries.project_1' && /1 original project passage was not cited/.test(w.message)));
 p.projects.isLocked=true;r.entries=r.entries.filter(e=>e.id!=='project_1');
 const locked=n.compileNaturalComposition(p,r,job);
 assert.deepEqual(locked.candidate.projects,p.projects);assert(!locked.warnings.some(w=>w.path==='entries.project_1' && /not cited/.test(w.message)));
});
test('a multi-sentence echo does not trigger automatic replacement of the whole introduction',()=>{
 const {p,r}=setup();r.alternativeSummarySegments=[{text:'Software engineer with a background in event scheduling applications, technical architecture and project delivery checklists.',sourceIds:['headline','work_1_b1','work_1_b2']}];
 const out=n.compileNaturalComposition(p,r,job);assert.equal(out.candidate.summary.data,`${echo} ${second}`);
 assert(out.warnings.some(w=>/closely echoes/.test(w.message)));assert(!out.warnings.some(w=>/Used the alternative AI summary/.test(w.message)));
});
