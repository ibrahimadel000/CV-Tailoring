// Hand-authored fictional responses: exercises the app pipeline, not AI quality.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs'),{fixture}=require('./helpers/composer-editorial-v4-fixture.cjs');
const {prepareNaturalComposition}=load('services/resumeComposer/naturalDocument');
const {prepareSingleDraftRequest,singleDraftInstructions}=load('services/resumeComposer/singleDraftRequest');
const {createCompositionRunner}=load('services/resumeComposer/workflow');
const cases=[
 {role:'Care assistant',job:'Care assistant: support patient mobility, record observations, and communicate with the nursing team.',bullets:['Assisted patients with mobility under nurse supervision.','Recorded observations for the nursing team.'],orders:[[0,1],[1,0]]},
 {role:'Teacher',job:'Teaching assistant: support classroom instruction and prepare age-appropriate learning activities.',bullets:['Prepared classroom learning activities.','Supported students during lessons under teacher supervision.'],orders:[[1,0],[0,1]]},
 {role:'Restaurant host',job:'Restaurant host: welcome guests, organize reservations and communicate with service staff.',bullets:['Welcomed guests and organized table reservations.','Shared service updates with the restaurant team.'],orders:[[0,1],[1,0]]},
 {role:'Electrical apprentice',job:'Electrical apprentice: assist licensed electricians and follow safety procedures while installing fixtures.',bullets:['Assisted a licensed electrician with fixture installation.','Followed site safety procedures during training.'],orders:[[0,1],[1,0]]},
 {role:'مساعد إداري',job:'مساعد إداري: تنظيم المواعيد وإعداد المستندات ودعم الفريق في الأعمال اليومية.',bullets:['نظمت مواعيد الفريق وأعددت المستندات.','ساعدت في تنظيم الاجتماعات الأسبوعية.'],orders:[[0,1],[1,0]]},
];
for(const c of cases)test('fictional '+c.role+' preserves evidence and ranking in the offline app pipeline',async()=>{
 const p=fixture();p.profileName='Fictional offline test';p.experience.data[0].roleTitle=c.role;
 p.experience.data[0].bullets=c.bullets.map(text=>({id:crypto.randomUUID(),text,isVerified:true}));
 const before=JSON.stringify(p),packet=prepareNaturalComposition(p,c.job),prepared=prepareSingleDraftRequest(packet),wire=JSON.parse(prepared.wire),entry=packet.source.experience[0];
 assert.equal(wire.job,c.job);assert(singleDraftInstructions.includes('whether technical or nontechnical'));
 for(const order of c.orders){
  let active=p,saves=0;const raw={summarySegments:[],skillSelections:[],entries:[{id:entry.id,overview:{text:'',sourceIds:[]},bullets:order.map(i=>({text:c.bullets[i],sourceIds:[entry.bulletIds[i]]}))}]};
  const run=createCompositionRunner({readActive:()=>active,appendIfCurrent(snapshot,copy){assert.equal(snapshot,before);saves++;active=copy;return true;}},async()=>raw);
  const result=await run.run(c.job,new AbortController().signal);
  assert.equal(result.status,'created');assert.equal(result.semanticStatus,'unassessed');assert.equal(saves,1);assert.equal(JSON.stringify(p),before);
  assert.deepEqual(active.experience.data[0].bullets.map(b=>b.text),order.map(i=>c.bullets[i]));
 }
});

test('fictional professional skills keep their original names and qualifications',async()=>{
 for(const item of [
  {role:'Care assistant',job:'Care assistant: supervised patient care and accurate observation notes.',name:'Patient care',level:'Under supervision',category:'Technical'},
  {role:'Teacher',job:'Teaching assistant: support classroom management and student learning.',name:'Classroom management',level:'Assistant level',category:'Technical'},
  {role:'Accountant',job:'Accounting assistant: support bookkeeping and financial record preparation.',name:'Bookkeeping',level:'Coursework',category:'Technical'},
  {role:'Host',job:'Hospitality host: welcome guests and provide customer service.',name:'Customer service',level:'Front desk',category:'Soft'},
  {role:'مساعد إداري',job:'مساعد إداري: مهارات التواصل وتنظيم الأعمال ودعم الفريق.',name:'التواصل',level:'مستوى أساسي',category:'Soft'},
 ]){
  const p=fixture();p.experience.data[0].roleTitle=item.role;p.experience.data[0].bullets=['Supported daily work under supervision.','Recorded routine work updates.'].map(text=>({id:crypto.randomUUID(),text,isVerified:true}));p.skills.data=[{id:crypto.randomUUID(),name:item.name,category:item.category,level:item.level}];
  const packet=prepareNaturalComposition(p,item.job),entry=packet.source.experience[0],facts=new Map(packet.source.evidence.map(f=>[f.id,f.text]));
  const raw={summarySegments:[],skillSelections:[{id:'skill_1',category:item.category}],entries:[{id:entry.id,overview:{text:'',sourceIds:[]},bullets:entry.bulletIds.toReversed().map(id=>({text:facts.get(id),sourceIds:[id]}))}]};
  let active=p;const before=JSON.stringify(p);const run=createCompositionRunner({readActive:()=>active,appendIfCurrent(snapshot,copy){assert.equal(snapshot,before);active=copy;return true;}},async()=>raw);
  assert.equal((await run.run(item.job,new AbortController().signal)).status,'created');
  assert.deepEqual(active.skills.data.map(s=>({name:s.name,level:s.level,category:s.category})),[{name:item.name,level:item.level,category:item.category}]);assert.equal(JSON.stringify(p),before);
 }
});

test('active guidance names a range of occupational and spoken-language skills',()=>{
 for(const text of ['clinical, education, service, trade, financial, creative, operational and technical duties','Spoken, programming and markup languages','primary substantive action (technical or nontechnical)']) assert(singleDraftInstructions.includes(text),text);
});
