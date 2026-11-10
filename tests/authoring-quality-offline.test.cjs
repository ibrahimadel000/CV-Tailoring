// Hand-authored synthetic examples. These test compiler acceptance, NOT provider behavior.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture}=require('./helpers/composer-editorial-v4-fixture.cjs');
const natural=load('services/resumeComposer/naturalDocument');
const {createCompositionRunner}=load('services/resumeComposer/workflow');
function makeResponse(p,job,summary,order,rewrites={}) {
 const s=natural.prepareNaturalComposition(p,job).source, facts=new Map(s.evidence.map(f=>[f.id,f.text]));
 return {summarySegments:summary,alternativeSummarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:order.map(i=>({text:rewrites[i]||facts.get(e.bulletIds[i]),sourceIds:[e.bulletIds[i]]}))})),skillSelections:[]};
}
test('same evidence can support different job emphases without invented tools or duties',()=>{
 const p=fixture(),before=JSON.stringify(p);
 const backend='Software engineer: build web applications, improve delivery workflows, and document development.';
 const trainer='Developer onboarding role: deliver technical workshops and support software teams.';
 const a=makeResponse(p,backend,[{text:'Software engineer combining web application development with improvements to delivery workflows.',sourceIds:['headline','work_1_b1','work_1_b2']}],[0,1,2],{0:'Developed web applications and technical architectures.'});
 const b=makeResponse(p,trainer,[{text:'Software engineer with a background in web application development and technical onboarding workshops.',sourceIds:['headline','work_1_b1','work_1_b3']}],[2,0,1],{0:'Developed web applications and technical architectures.'});
 const x=natural.compileNaturalComposition(p,a,backend),y=natural.compileNaturalComposition(p,b,trainer);
 assert.equal(x.candidate.experience.data[0].bullets[0].text,'Developed web applications and technical architectures.');
 assert.equal(y.candidate.experience.data[0].bullets[0].text,'Delivered technical onboarding workshops.');
 assert.notEqual(x.candidate.summary.data,y.candidate.summary.data);
 assert(!JSON.stringify(x.candidate.experience).includes('Python'));assert(!JSON.stringify(y.candidate.experience).includes('Python'));
 assert.equal(JSON.stringify(p),before);assert.equal(x.semanticStatus,'unassessed');assert.equal(y.semanticStatus,'unassessed');
});
test('one mocked response can yield edited and reordered work in a separate copy',async()=>{
 const p=fixture(),job='Software engineer: build web applications, improve delivery workflows, and document development.',before=JSON.stringify(p);
 let active=p,calls=0,copy;const raw=makeResponse(p,job,[{text:'Software engineer combining web application development with improvements to delivery workflows.',sourceIds:['headline','work_1_b1','work_1_b2']}],[1,0,2],{0:'Developed web applications and technical architectures.'});
 const run=createCompositionRunner({readActive:()=>active,appendIfCurrent(snapshot,next){assert.equal(snapshot,before);copy=next;active=next;return true;}},async()=>{calls++;return raw;});
 const result=await run.run(job,new AbortController().signal);assert.equal(result.status,'created');assert.equal(calls,1);
 assert.equal(copy.compositionChanges.experience,'edited');assert.equal(copy.experience.data[0].bullets[1].text,'Developed web applications and technical architectures.');assert.equal(JSON.stringify(p),before);
});
test('experimental prompt asks for useful edits while preserving scope and clear originals',()=>{
 assert.match(natural.naturalInstructions,/Make meaningful editorial improvements/);
 assert.match(natural.naturalInstructions,/any stated outcome/);
 assert.match(natural.naturalInstructions,/do not add or strengthen any of these/);
 assert.match(natural.naturalInstructions,/A useful original bullet may stay unchanged; no rewrite quota/);
});
