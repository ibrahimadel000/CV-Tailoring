// Prepared contract cases, ZERO Google. No semantic quality certification.
const {test}=require('node:test'),assert=require('node:assert/strict');const{load}=require('./helpers/editorial-loader.cjs');
const v5=load('services/resumeComposer/typedSummaryDocument'),{fixture,response,job}=require('./helpers/composer-grouped-v5-fixture.cjs'),{createCompositionRunner}=load('services/resumeComposer/workflow');
test('each group schema binds its own source IDs rather than a pooled enum and kind',()=>{
 const packet=v5.prepareGroupedComposition(fixture(),job),wire=v5.googleGroupedSchema(packet),s=wire.properties.summaryClaims;
 assert.equal(s.type,'OBJECT');assert.deepEqual(s.required,['profile','experience','skills','qualification']);
 for(const group of s.required){assert.deepEqual(s.properties[group].items.properties.sourceIds.items.enum,packet.claimReferencePolicy[group]);assert(!s.properties[group].items.properties.kind);}
 assert(!s.properties.experience.items.properties.sourceIds.items.enum.includes('skill_1'));
});
test('valid grouped claims become natural native summary in documented order',()=>{
 const p=fixture(),raw=response(p),before=JSON.stringify(p),out=v5.compileGroupedComposition(p,raw);
 assert.equal(out.candidate.summary.data,['profile','experience','skills','qualification'].flatMap(g=>raw.summaryClaims[g].map(c=>c.text)).join(' '));assert.equal(JSON.stringify(p),before);
});
for(const group of ['profile','experience','skills','qualification'])test('cross-kind IDs rejected in '+group+' without reclassification or truncation',()=>{
 const p=fixture(),raw=response(p);raw.summaryClaims[group]=[{text:'Prepared text.',sourceIds:[group==='skills'?'work_1_b1':'skill_1']}];
 assert.throws(()=>v5.compileGroupedComposition(p,raw),new RegExp('permitted '+group+' group'));
});
test('duplicate citations diagnosed as duplicates, not a false experience accusation',()=>{
 const p=fixture(),raw=response(p);raw.summaryClaims.experience[0].sourceIds=['work_1_b1','work_1_b1'];assert.throws(()=>v5.compileGroupedComposition(p,raw),/duplicate reference IDs/);
});
test('unknown ID rejected without echoing arbitrary private data in the error',()=>{
 const p=fixture(),raw=response(p);raw.summaryClaims.experience[0].sourceIds=['PRIVATE_UNTRUSTED_MARKER'];try{v5.compileGroupedComposition(p,raw);assert.fail('expected rejection');}catch(e){assert(e.message.includes('permitted experience group'));assert(!e.message.includes('PRIVATE_UNTRUSTED_MARKER'));}
});
test('missing group or independent kind is rejected; no silent legacy conversion',()=>{
 const p=fixture();for(const change of [r=>delete r.summaryClaims.profile,r=>r.summaryClaims.experience[0].kind='skills',r=>r.summaryClaims=[],r=>r.summaryClaims.other=[]]){const raw=response(p);change(raw);assert.throws(()=>v5.compileGroupedComposition(p,raw));}
});
test('empty or locked groups get zero-item provider bound and stay empty locally',()=>{
 const p=fixture();p.summary.isLocked=true;const packet=v5.prepareGroupedComposition(p,job),wire=v5.googleGroupedSchema(packet);
 for(const group of v5.SUMMARY_GROUP_ORDER)assert.equal(wire.properties.summaryClaims.properties[group].maxItems,0);
 const raw=response(p);assert.deepEqual(v5.compileGroupedComposition(p,raw).candidate.summary,p.summary);
 raw.summaryClaims.skills=[{text:'Skills include Python.',sourceIds:['skill_1']}];assert.throws(()=>v5.compileGroupedComposition(p,raw),/summary is locked/);
});
test('absent work references cannot acquire a generated work sentence',()=>{
 const p=fixture();p.experience.data=[];p.projects.data=[];const packet=v5.prepareGroupedComposition(p,job),wire=v5.googleGroupedSchema(packet);assert.equal(wire.properties.summaryClaims.properties.experience.maxItems,0);
 const raw=response(p);raw.summaryClaims.experience=[{text:'Worked on services.',sourceIds:['skill_1']}];assert.throws(()=>v5.compileGroupedComposition(p,raw),/permitted experience group/);
});
test('total claims remain bounded across groups, not five in each group',()=>{
 const p=fixture(),raw=response(p);raw.summaryClaims.experience=Array.from({length:5},()=>({...raw.summaryClaims.experience[0]}));assert.throws(()=>v5.compileGroupedComposition(p,raw),/across all groups/);
});
for(const field of ['revision','summaryGroupOrder','outputContract','referencePolicy','claimReferencePolicy'])test('tampered '+field+' fails before provider',()=>{const p=v5.prepareGroupedComposition(fixture(),job);p[field]=field==='revision'?'old':{};assert.throws(()=>v5.googleGroupedSchema(p),/mismatch/);});
test('active workflow uses one natural invocation and makes a separate native copy',async()=>{
 const p=fixture(),before=JSON.stringify(p);let calls=0,saves=0;const run=createCompositionRunner({readActive:()=>p,appendIfCurrent(snapshot,copy){assert.equal(snapshot,before);assert.notEqual(copy.profileId,p.profileId);saves++;return true;}},async packet=>{calls++;assert.equal(packet.revision,load('services/resumeComposer/naturalDocument').NATURAL_REVISION);return require('./helpers/composer-natural-fixture.cjs').response(p);});
 const out=await run.run(job,new AbortController().signal);assert.equal(out.status,'created');assert.equal(calls,1);assert.equal(saves,1);assert.equal(JSON.stringify(p),before);
});
test('flawed response no longer discards the document; a reviewed copy is saved with notes',async()=>{
 const p=fixture();let calls=0,saves=0;const run=createCompositionRunner({readActive:()=>p,appendIfCurrent(){saves++;return true;}},async()=>{calls++;const raw=require('./helpers/composer-natural-fixture.cjs').response(p);raw.summarySegments[0].sourceIds=['unknown'];return raw;});
 // Claim guard: graceful normalization replaces total failure; exactly one invocation,
 // one reviewed copy, original summary kept.
 const out=await run.run(job,new AbortController().signal);assert.equal(calls,1);assert.equal(saves,1);
 assert(out.guardNotes.some(g=>g.path==='summarySegments.0'));assert.equal(out.candidate.summary.data,p.summary.data.trim());
});
test('valid work IDs still cannot prove a sentence semantically; limitation retained',()=>{
 const p=fixture(),raw=response(p);raw.summaryClaims.experience[0].text='Owned the production automated test strategy.';const out=v5.compileGroupedComposition(p,raw);assert(out.candidate.summary.data.includes('Owned the production'));assert(!('qualityStatus'in out));
});
test('active instructions describe only the grouped protocol, preserving factual boundaries',()=>{
 assert(v5.groupedInstructions.includes('ACTIVE OUTPUT CONTRACT IS v5'));assert(!v5.groupedInstructions.includes('ACTIVE OUTPUT CONTRACT IS v4'));assert(v5.groupedInstructions.includes('There is no independently chosen kind field'));assert(v5.groupedInstructions.includes('do not attach them to a particular employer'));
});
