// Fictional, manually prepared outputs: these test the pipeline, not the model.
const {test} = require('node:test'), assert = require('node:assert/strict');
const {load} = require('./helpers/editorial-loader.cjs');
const {fixture} = require('./helpers/composer-editorial-v4-fixture.cjs');
const {prepareNaturalComposition} = load('services/resumeComposer/naturalDocument');
const {createCompositionRunner} = load('services/resumeComposer/workflow');
const backendJob = 'Backend engineering role: build web applications and maintain technical architectures. Clear documentation is useful.';
const trainingJob = 'Technical onboarding role: deliver developer workshops and support technical learning. Clear documentation is useful.';

async function run(job, order) {
  const original = fixture(); original.profileName = 'Fictional source';
  original.experience.data[0].bullets = [
    'Assisted with the testing of internal web applications under supervision.',
    'Documented API behavior for the developer team.',
    'Prepared and delivered technical onboarding workshops for new developers.'
  ].map(text=>({id:crypto.randomUUID(),text,isVerified:true}));
  const before = JSON.stringify(original), source = prepareNaturalComposition(original, job).source;
  const id = source.experience[0].id, ids = source.experience[0].bulletIds;
  const edits = ['Supported testing of internal web applications under supervision.',
    'Documented API behavior for developers.',
    'Delivered technical onboarding workshops for new developers.'];
  const raw = {summarySegments: [], alternativeSummarySegments: [], skillSelections: [{id:'skill_1',category:'Languages'}],
    entries: [{id, overview:{text:'',sourceIds:[]}, bullets:order.map(i=>({text:edits[i],sourceIds:[ids[i]]}))}]};
  let calls = 0, saved, active = original;
  const runner = createCompositionRunner({readActive:()=>active, appendIfCurrent(snapshot, copy) {
    assert.equal(snapshot, before); saved=active=copy; return true;
  }}, async()=>{calls++;return raw;});
  const result = await runner.run(job,new AbortController().signal);
  assert.equal(calls, 1); assert.equal(result.status, 'created');
  assert.equal(JSON.stringify(original),before); assert.notEqual(saved.profileId,original.profileId);
  assert.deepEqual(saved.experience.data[0].bullets.map(b=>b.text),order.map(i=>edits[i]));
  assert.deepEqual(result.proposalComparison,{proposed:3,different:3});
  assert.equal(result.semanticStatus,'unassessed');
  return saved.experience.data[0].bullets.map(b=>b.text);
}
test('two fictional job-focused edited outputs survive the complete offline pipeline',async()=>{
  const backend=await run(backendJob,[0,1,2]), training=await run(trainingJob,[2,0,1]);
  assert.equal(backend[0],'Supported testing of internal web applications under supervision.');
  assert.equal(training[0],'Delivered technical onboarding workshops for new developers.');
  // Prepared responses and manual expectations only: no inference about model performance.
});
