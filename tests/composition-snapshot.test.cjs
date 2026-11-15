// Fictional offline data. A snapshot is not a claim verification or passage mapping.
const {test}=require('node:test'), assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,response,job}=require('./helpers/composer-natural-fixture.cjs');
const {captureCompositionSnapshot}=load('services/resumeComposer/compositionSnapshot');
const {createCompositionRunner}=load('services/resumeComposer/workflow');
const {cvProfileSchema,compositionSnapshotSchema}=load('types/schema');
const {resumeBlocks}=load('components/builder/resumeModel');
const clone=x=>JSON.parse(JSON.stringify(x));

test('complete professional entries, source order and omissions retained without unrelated fields',()=>{
 const source=fixture(), candidate=clone(source);
 source.summary.data='Original summary';source.experience.data[0].description='Overview with a qualification';
 source.experience.data[0].bullets[2].text='Omitted passage with context';
 source.projects.data=[{id:crypto.randomUUID(),name:'Project A',role:'Contributor',url:'https://private.example/contact',bullets:[{id:crypto.randomUUID(),text:'Project passage',isVerified:true}]}];
 Object.assign(source.resumeHeader.data,{email:'secret@example.test',phone:'555-555-5555',photoUrl:'photo-secret'});
 source.targetJob='job-secret';source.customSections=[{secret:'private-section'}];
 candidate.summary.data='Final summary'; candidate.experience.data[0].bullets.splice(2,1);candidate.projects.data=clone(source.projects.data);
 const snapshot=captureCompositionSnapshot(source,candidate).snapshot, serialized=JSON.stringify(snapshot);
 assert.equal(snapshot.source.summary,'Original summary');assert.equal(snapshot.generated.summary,'Final summary');
 assert.deepEqual(snapshot.source.experience[0].bullets,source.experience.data[0].bullets.map(b=>b.text));
 assert.equal(snapshot.source.experience[0].fields.find(f=>f.label==='Overview').value,'Overview with a qualification');
 assert(!snapshot.generated.experience[0].bullets.includes('Omitted passage with context'));
 assert.equal(snapshot.source.projects[0].bullets[0],'Project passage');
 for(const secret of ['secret@example.test','555-555-5555','photo-secret','job-secret','private-section','https://private.example/contact','isVerified']) assert(!serialized.includes(secret));
 assert(compositionSnapshotSchema.safeParse(snapshot).success);
 candidate.summary.data='Later';source.experience.data=[];assert.equal(snapshot.generated.summary,'Final summary');assert.equal(snapshot.source.experience.length,1);
});

test('size limit counts encoded bytes and never truncates',()=>{
 const p=fixture();p.summary.data='文'.repeat(180000);
 assert.equal(captureCompositionSnapshot(p,p).reason,'too_large');
 const q=fixture();q.summary.data='文'.repeat(100000);const captured=captureCompositionSnapshot(q,q).snapshot;
 assert.equal(captured.source.summary,q.summary.data);assert.equal(captured.generated.summary,q.summary.data);
 const oversized=clone(captured);oversized.source.summary='文'.repeat(360000);assert(!compositionSnapshotSchema.safeParse(oversized).success);
});

test('runner captures final copy locally, retains source, and replaces history on re-tailoring',async()=>{
 const p=fixture(); p.experience.isLocked=true; const before=clone(p); let active=p,packets=[],copies=[];
 const runner=createCompositionRunner({readActive:()=>active,appendIfCurrent(snapshot,next){assert.equal(snapshot,JSON.stringify(active));copies.push(next);active=next;return true;}},async packet=>{
   packets.push(packet); const doc=response(active); doc.summarySegments=[{text:copies.length ? 'A software engineer building web applications.' : 'Software Engineer with experience building web applications.',sourceIds:['work_1_b1']}]; return doc;
 });
 const r=await runner.run(job,new AbortController().signal);assert.equal(r.status,'created');
 assert.deepEqual(p,before);let first=copies[0];assert.deepEqual(first.experience,p.experience);
 assert.equal(first.compositionSnapshot.source.summary,p.summary.data);assert.equal(first.compositionSnapshot.generated.summary,first.summary.data);
 assert.deepEqual(first.compositionSnapshot.generated.experience[0].bullets,p.experience.data[0].bullets.map(b=>b.text));
 assert(cvProfileSchema.safeParse(clone(first)).success);
 assert(!JSON.stringify(packets[0]).includes('compositionSnapshot'));assert(!JSON.stringify(resumeBlocks(first)).includes('compositionSnapshot'));
 const prior=clone(first.compositionSnapshot);first.summary.data='Edited source summary before re-tailoring';
 const second=await runner.run(job,new AbortController().signal);assert.equal(second.status,'created');
 assert.equal(copies[1].compositionSnapshot.source.summary,'Edited source summary before re-tailoring');
 assert.equal(copies[1].compositionSnapshot.generated.summary,copies[1].summary.data);assert.deepEqual(first.compositionSnapshot,prior);
 assert(!JSON.stringify(packets[1]).includes('compositionSnapshot'));assert(!JSON.stringify(packets[1]).includes(prior.source.summary));
});


test('oversize snapshot does not block a valid copy and never inherits old history',async()=>{
 const p=fixture();p.experience.data[0].city='文'.repeat(180000);
 p.compositionSnapshot=captureCompositionSnapshot(fixture(),fixture()).snapshot;let active=p,copy;
 const runner=createCompositionRunner({readActive:()=>active,appendIfCurrent(snapshot,next){assert.equal(snapshot,JSON.stringify(active));copy=next;active=next;return true;}},async()=>response(p));
 const result=await runner.run(job,new AbortController().signal);
 assert.equal(result.status,'created');assert.equal(result.snapshotStatus,'too_large');
 assert.equal(copy.compositionSnapshot,undefined);assert.equal(copy.compositionSnapshotStatus,'too_large');
 assert.equal(copy.experience.data[0].city,p.experience.data[0].city);assert(cvProfileSchema.safeParse(copy).success);
});


test('opting out creates a copy without retaining an inherited snapshot',async()=>{
 const p=fixture();p.compositionSnapshot=captureCompositionSnapshot(p,p).snapshot;let active=p,copy;
 const runner=createCompositionRunner({readActive:()=>active,appendIfCurrent(snapshot,next){copy=next;active=next;return true;}},async()=>response(p));
 const result=await runner.run(job,new AbortController().signal,{saveComparison:false});
 assert.equal(result.status,'created');assert.equal(result.snapshotStatus,'not_saved');assert.equal(copy.compositionSnapshot,undefined);assert.equal(copy.compositionSnapshotStatus,'not_saved');
});


test('link and contact-like professional text prevents storing any partial comparison',()=>{
 const p=fixture();for(const text of ['Built [tool](https://example.test/private).','Portfolio www.example.test/path','Reach me at user@example.test','Phone: +1 555 123 4567','docs.example.test/path','example.com']) {
   p.experience.data[0].bullets[0].text=text;const result=captureCompositionSnapshot(p,p);
   assert.equal(result.reason,'sensitive_text');assert.equal(result.snapshot,undefined);
 }
 p.experience.data[0].bullets[0].text='Used Node.js for 2022 - 2025 reporting.';assert(captureCompositionSnapshot(p,p).snapshot);
});
test('future or malformed snapshot does not invalidate the profile and is retained',()=>{
 for(const stored of [{version:'future-v9',source:{secret:'kept'}},{version:'professional-comparison-v1',source:null},null]){
   const p=fixture();p.compositionSnapshot=stored;p.compositionSnapshotStatus={futureStatus:'preserved'};assert(cvProfileSchema.safeParse(p).success);
   assert(!compositionSnapshotSchema.safeParse(stored).success);assert.deepEqual(cvProfileSchema.parse(p).compositionSnapshot,stored);
 }
});


test('detected contact in professional text skips the snapshot, not the copy',async()=>{
 const p=fixture();p.experience.data[0].city='https://private.example/path';let active=p,copy;
 const runner=createCompositionRunner({readActive:()=>active,appendIfCurrent(snapshot,next){copy=next;active=next;return true;}},async()=>response(p));
 const result=await runner.run(job,new AbortController().signal);
 assert.equal(result.status,'created');assert.equal(result.snapshotStatus,'sensitive_text');
 assert.equal(copy.compositionSnapshot,undefined);assert.equal(copy.experience.data[0].city,p.experience.data[0].city);
});


test('comparison preference is frozen before the provider resolves in both directions',async()=>{
 for(const initially of [false,true]){
  const p=fixture();let copy,release;const options={saveComparison:initially};
  const runner=createCompositionRunner({readActive:()=>p,appendIfCurrent(_,next){copy=next;return true;}},()=>new Promise(resolve=>{release=resolve;}));
  const pending=runner.run(job,new AbortController().signal,options);options.saveComparison=!initially;release(response(p));
  const result=await pending;assert.equal(result.status,'created');
  assert.equal(!!copy.compositionSnapshot,initially);
  assert.equal(copy.compositionSnapshotStatus,initially ? undefined : 'not_saved');
 }
});
