// Offline structural comparisons; not a model-quality or factuality test.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const {response}=require('./helpers/composer-natural-fixture.cjs');
const {summarizeChanges}=load('services/resumeComposer/changeSummary');
const {createCompositionRunner}=load('services/resumeComposer/workflow');
const {cvProfileSchema}=load('types/schema'),{resumeBlocks}=load('components/builder/resumeModel');
const clone=x=>JSON.parse(JSON.stringify(x));
test('identical and older profiles report unchanged and remain schema-compatible',()=>{
 const p=fixture(), before=JSON.stringify(p), c=summarizeChanges(p,clone(p));
 assert.deepEqual(c,{summary:'unchanged',experience:'unchanged',projects:'empty',skills:{retained:p.skills.data.length,excluded:[],added:0,reordered:false,regrouped:false}});
 assert(cvProfileSchema.safeParse(p).success);assert.equal(JSON.stringify(p),before);
});
test('summary changes and bullet reordering are not called rewritten content',()=>{
 const p=fixture(),q=clone(p);q.summary.data+=' Changed.';q.experience.data[0].bullets.reverse();
 const c=summarizeChanges(p,q);assert.equal(c.summary,'changed');assert.equal(c.experience,'reordered');
 q.experience.data[0].bullets[0].text+=' Changed.';assert.equal(summarizeChanges(p,q).experience,'edited');
 q.experience.data[0].bullets.pop();assert.equal(summarizeChanges(p,q).experience,'edited');
});
test('duplicate text, entry order and project changes are compared correctly',()=>{
 const p=fixture();p.experience.data[0].bullets[1].text=p.experience.data[0].bullets[0].text;
 const q=clone(p);q.experience.data[0].bullets.reverse();assert.equal(summarizeChanges(p,q).experience,'reordered');
 q.experience.data[0].bullets[0].text=p.experience.data[0].bullets[0].text;assert.equal(summarizeChanges(p,q).experience,'edited');
 const r=clone(p);r.projects.data=[{id:crypto.randomUUID(),description:'Example',bullets:[]}];assert.equal(summarizeChanges(p,r).projects,'edited');
});
test('omitted, reordered and regrouped skills are distinct and qualification is retained',()=>{
 const p=fixture();p.skills.data[1].level='Coursework only';const q=clone(p);q.skills.data.splice(1,1);
 let c=summarizeChanges(p,q).skills;assert.equal(c.retained,p.skills.data.length-1);assert.deepEqual(c.excluded,[{name:'RESTful APIs',level:'Coursework only'}]);assert.equal(c.reordered,false);assert.equal(c.regrouped,false);
 q.skills.data.reverse();q.skills.data[0].category='Other';q.skills.data.push({id:crypto.randomUUID(),name:'Added',category:'Other',level:''});c=summarizeChanges(p,q).skills;
 assert.equal(c.reordered,true);assert.equal(c.regrouped,true);assert.equal(c.added,1);
});
test('runner stores a historical comparison only locally and preserves the source',async()=>{
 const p=fixture();p.compositionChanges={summary:'unchanged',experience:'empty',projects:'empty',skills:{retained:0,excluded:[{name:'HISTORICAL_PRIVATE_SENTINEL'}],added:0,reordered:false,regrouped:false}};
 const before=JSON.stringify(p);let active=p,copy,packet;
 const runner=createCompositionRunner({readActive:()=>active,appendIfCurrent(snapshot,next){assert.equal(snapshot,before);copy=next;active=next;return true;}},async sent=>{packet=sent;return response(p);});
 const result=await runner.run(job,new AbortController().signal);assert.equal(result.status,'created');assert.equal(JSON.stringify(p),before);
 assert.deepEqual({...copy.compositionChanges,mode:undefined,proposal:undefined},{...summarizeChanges(p,copy),mode:undefined,proposal:undefined});
 assert(copy.compositionChanges.proposal);assert.equal(copy.compositionChanges.mode,'rewrite');assert(cvProfileSchema.safeParse(JSON.parse(JSON.stringify(copy))).success);
 assert(!JSON.stringify(packet).includes('HISTORICAL_PRIVATE_SENTINEL'));assert(!JSON.stringify(resumeBlocks(copy)).includes('HISTORICAL_PRIVATE_SENTINEL'));
 assert(!JSON.stringify(resumeBlocks(copy)).includes('compositionChanges'));
});
