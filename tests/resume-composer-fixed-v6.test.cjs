// Authored offline regression cases. ZERO Google calls, no quality certification.
const{test}=require('node:test'),assert=require('node:assert/strict');
const{load}=require('./helpers/editorial-loader.cjs'),v6=load('services/resumeComposer/fixedSummaryDocument'),v5=load('services/resumeComposer/typedSummaryDocument');
const{fixture,response,job}=require('./helpers/composer-fixed-v6-fixture.cjs');
test('wire topology has exactly four objects, never independently sized claim arrays',()=>{
 const p=v6.prepareFixedComposition(fixture(),job),s=v6.googleFixedSchema(p).properties;
 assert(!s.summaryClaims);assert.deepEqual(s.summaryBlocks.required,[...v6.SUMMARY_BLOCK_ORDER]);
 for(const g of v6.SUMMARY_BLOCK_ORDER){const b=s.summaryBlocks.properties[g];assert.equal(b.type,'OBJECT');assert(!b.items);assert.deepEqual(b.required,['text','sourceIds']);assert.deepEqual(b.properties.sourceIds.items.enum,p.claimReferencePolicy[g]);}
 assert.equal(p.outputContract.properties.summaryBlocks.properties.experience.properties.text.maxLength,599);
});
test('six natural sentences no longer trigger an artificial claim-count rejection',()=>{
 const p=fixture(),r=response(p);r.summaryBlocks.experience.text='Built web applications. Developed technical architectures. Improved delivery workflows. Reduced technical overhead. Delivered training. Supported onboarding.';
 const out=v6.compileFixedComposition(p,r);assert(out.candidate.summary.data.includes(r.summaryBlocks.experience.text));assert.equal(out.summaryClaims.length,2);
});
test('all four blocks at maximum fit native budget with joining spaces and no truncation',()=>{
 const p=fixture(),r=response(p),packet=v6.prepareFixedComposition(p,job);
 for(const g of v6.SUMMARY_BLOCK_ORDER){assert(packet.claimReferencePolicy[g].length);r.summaryBlocks[g]={text:g[0].repeat(599),sourceIds:[packet.claimReferencePolicy[g][0]]};}
 const out=v6.compileFixedComposition(p,r);assert.equal(out.candidate.summary.data.length,2399);assert.equal(out.summaryClaims.length,4);assert.equal(out.candidate.summary.data,v6.SUMMARY_BLOCK_ORDER.map(g=>r.summaryBlocks[g].text).join(' '));
});
test('overlong block rejects whole response, never cuts or saves part',()=>{
 const p=fixture(),r=response(p),before=JSON.stringify(p);r.summaryBlocks.experience.text='x'.repeat(600);assert.throws(()=>v6.compileFixedComposition(p,r),/summaryBlocks.experience.text/);assert.equal(JSON.stringify(p),before);
});
for(const g of ['profile','experience','skills','qualification'])test('wrong-kind reference is rejected in '+g,()=>{
 const p=fixture(),r=response(p);r.summaryBlocks[g]={text:'Prepared text.',sourceIds:[g==='skills'?'work_1_b1':'skill_1']};assert.throws(()=>v6.compileFixedComposition(p,r),new RegExp('permitted '+g+' group'));
});
test('empty block and empty references agree; no phantom claims from unused groups',()=>{const p=fixture(),r=response(p),out=v6.compileFixedComposition(p,r);assert.equal(out.summaryClaims.length,2);assert(!out.candidate.summary.data.startsWith(' '));});
for(const [name,block]of Object.entries({uncited:{text:'Prepared text.',sourceIds:[]},orphanRefs:{text:'',sourceIds:['skill_1']}}))test(name+' rejected rather than guessed',()=>{const p=fixture(),r=response(p);r.summaryBlocks.skills=block;assert.throws(()=>v6.compileFixedComposition(p,r),/both be present or both empty/);});
test('duplicate reference error stays separate and private markers are not echoed',()=>{const p=fixture(),r=response(p);r.summaryBlocks.experience.sourceIds=['work_1_b1','work_1_b1'];assert.throws(()=>v6.compileFixedComposition(p,r),/duplicate reference IDs/);r.summaryBlocks.experience.sourceIds=['PRIVATE-MARKER'];try{v6.compileFixedComposition(p,r);assert.fail();}catch(e){assert(!e.message.includes('PRIVATE-MARKER'));assert(e.message.includes('permitted experience group'));}});
test('old grouped response, missing block, extra block and kind are not silently converted',()=>{
 const p=fixture();assert.throws(()=>v6.compileFixedComposition(p,require('./helpers/composer-grouped-v5-fixture.cjs').response(p)));
 for(const mutate of [r=>delete r.summaryBlocks.profile,r=>r.summaryBlocks.other={text:'',sourceIds:[]},r=>r.summaryBlocks.experience.kind='experience',r=>r.summaryBlocks.experience=[]]){const r=response(p);mutate(r);assert.throws(()=>v6.compileFixedComposition(p,r));}
});
test('summary lock retains exact native text and rejects any generated block',()=>{const p=fixture();p.summary.isLocked=true;p.summary.data='  Exact locked text  ';const r=response(p),out=v6.compileFixedComposition(p,r);assert.deepEqual(out.candidate.summary,p.summary);r.summaryBlocks.experience={text:'Prepared text.',sourceIds:['work_1_b1']};assert.throws(()=>v6.compileFixedComposition(p,r),/summary is locked/);});
test('absent experience cannot borrow skill references; empty block is allowed',()=>{const p=fixture();p.experience.data=[];p.projects.data=[];const r=response(p);r.summaryBlocks.experience={text:'',sourceIds:[]};assert.equal(v6.googleFixedSchema(v6.prepareFixedComposition(p,job)).properties.summaryBlocks.properties.experience.properties.sourceIds.maxItems,0);v6.compileFixedComposition(p,r);r.summaryBlocks.experience={text:'Prepared text.',sourceIds:['skill_1']};assert.throws(()=>v6.compileFixedComposition(p,r),/permitted experience group/);});
for(const field of ['revision','summaryBlockOrder','outputContract','referencePolicy','claimReferencePolicy'])test('tampered '+field+' rejected before sending',()=>{const p=v6.prepareFixedComposition(fixture(),job);p[field]={};assert.throws(()=>v6.googleFixedSchema(p),/mismatch/);});
test('historical v6 response cannot cross the current natural runner boundary',async()=>{const {createCompositionRunner}=load('services/resumeComposer/workflow'),natural=load('services/resumeComposer/naturalDocument'),p=fixture();let calls=0,saves=0;const run=createCompositionRunner({readActive:()=>p,appendIfCurrent(){saves++;return true;}},async packet=>{calls++;assert.equal(packet.revision,natural.NATURAL_REVISION);return response(p);});await assert.rejects(run.run(job,new AbortController().signal));assert.equal(calls,1);assert.equal(saves,0);});
test('active prompt contains no five-slot or v4/v5 output contract',()=>{assert(v6.fixedInstructions.includes('ACTIVE OUTPUT CONTRACT IS v6'));assert(!v6.fixedInstructions.includes('filling five slots'));assert(!v6.fixedInstructions.includes('ACTIVE OUTPUT CONTRACT IS v4'));assert(v6.fixedInstructions.includes('do not attach them to a particular employer'));});
test('valid typed work reference still does not certify sentence meaning',()=>{const p=fixture(),r=response(p);r.summaryBlocks.experience.text='Owned production automated testing strategy.';const out=v6.compileFixedComposition(p,r);assert(out.candidate.summary.data.includes('Owned production'));assert(!('qualityStatus'in out));});
