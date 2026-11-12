// Fictional, hand-authored probes; these are not model outputs or semantic validation.
const {test}=require('node:test'), assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture}=require('./helpers/composer-editorial-v4-fixture.cjs');
const {prepareNaturalComposition,compileNaturalComposition}=load('services/resumeComposer/naturalDocument');
const {singleDraftInstructions}=load('services/resumeComposer/singleDraftRequest');

test('active prompt does not teach moving responsibility between different objects',()=>{
 assert(!singleDraftInstructions.includes('Coordinated laboratory maintenance and cross-team planning to align clinic schedules.'));
 assert(!singleDraftInstructions.includes('coordinating laboratory maintenance.'));
 assert(!singleDraftInstructions.includes('Cataloged rare manuscripts to coordinate conservation workflows'));
 assert.match(singleDraftInstructions,/do not turn a stated result into a purpose or vice versa/i);
 assert.match(singleDraftInstructions,/do not imply the candidate performed work on the thing being coordinated with/i);
 assert.match(singleDraftInstructions,/keep the original when an edit would change meaning/i);
});
const examples=[
 {source:'Aligned clinic schedules with laboratory maintenance through proactive planning and cross-team coordination.',faithful:'Aligned clinic schedules with laboratory maintenance through planning and cross-team coordination.',risky:'Coordinated laboratory maintenance and cross-team planning to align clinic schedules.'},
 {source:'Aligned volunteer schedules with building repairs through planning and team coordination.',faithful:'Aligned volunteer schedules with building repairs through team coordination and planning.',risky:'Coordinated building repairs and team planning to align volunteer schedules.'},
 {source:'Cataloged rare manuscripts, ensuring seamless coordination between conservation workflows and reading-room requests.',faithful:'Cataloged rare manuscripts, ensuring coordination between conservation workflows and reading-room requests.',risky:'Cataloged rare manuscripts to coordinate conservation workflows with reading-room requests.'},
];
for(const [i,c] of examples.entries()) test(`fictional relation probe ${i+1}: faithful edit remains, risky wording is not a semantic verdict`,()=>{
 const p=fixture();p.summary.data='';p.experience.data[0].description='';p.experience.data[0].bullets=[{id:crypto.randomUUID(),text:c.source,isVerified:true}];p.projects.data=[];p.skills.data=[];
 const original=JSON.stringify(p), job='Coordinator: align schedules and support the team.', s=prepareNaturalComposition(p,job).source;
 const run=text=>compileNaturalComposition(p,{summarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:[{text,sourceIds:[e.bulletIds[0]]}]})),skillSelections:[]},job);
 const faithful=run(c.faithful), risky=run(c.risky);
 assert.equal(faithful.candidate.experience.data[0].bullets[0].text,c.faithful);
 assert.equal(risky.semanticStatus,'unassessed');
 // No assertion that unsafe text remains: stronger guards may restore it later.
 assert.equal(JSON.stringify(p),original);
});

test('cross-occupation relation diagnostic reports paired cases without claiming semantic verification',()=>{
 const diagnostic=require('../scripts/factual-relations-baseline.cjs');
 const previous=global.fetch;global.fetch=()=>{throw new Error('Unexpected network call');};
 try{
  const rows=diagnostic.run();assert.equal(rows.length,diagnostic.CASES.length*2);
  assert(new Set(rows.map(x=>x.occupation)).size>=5);assert(rows.some(x=>x.language==='ar'));
  for(const row of rows){
   assert.equal(row.semanticStatus,'unassessed');assert.match(row.promptSha256,/^[a-f\d]{64}$/);assert.match(row.requestSha256,/^[a-f\d]{64}$/);
   if(row.variant==='faithful')assert.deepEqual(row.retained,[row.proposed],`${row.caseId}: avoid unnecessarily restoring this authored faithful edit`);
   else assert.notEqual(row.proposed,row.source);
  }
 }finally{global.fetch=previous;}
});
