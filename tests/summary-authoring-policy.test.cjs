// Pure brief + static prompt checks. No authoring, API, schema dependencies or semantic verdict.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const load=p=>process.features.typescript
 ? require('../src/'+p+'.ts')
 : require('./helpers/editorial-loader.cjs').load(p);
const {buildSummaryEvidenceBrief}=load('services/resumeComposer/references');
const {buildDocumentBrief}=load('services/resumeComposer/documentEditorial');
const file=path.join(__dirname,'../src/services/resumeComposer/naturalDocument.ts');
const code=fs.readFileSync(file,'utf8');
// Static text assertion, not execution or a generated-writing test.
const instructions=code.match(/export const naturalInstructions = `([\s\S]*?)`;/)?.[1];
function source(){
 return {locks:{summary:false},skillIds:['skill_1'],experience:[{id:'work_1',bulletIds:['work_1_b1']}],projects:[],
 originalSkillContexts:[],evidence:[
  {id:'headline',kind:'headline',text:'Software developer',parent:''},
  {id:'summary',kind:'summary',text:'Interested in accessible web experiences.',parent:''},
  {id:'work_1_b1',kind:'achievement',text:'Built internal reporting interfaces.',parent:'work_1'},
  {id:'skill_1',kind:'skill',text:'React — Coursework only',parent:''},
  {id:'education_1',kind:'education',text:'B.Sc. Computer Science (in progress)',parent:''},
  {id:'context_1',kind:'context',text:'Volunteering · Helped at community workshops.',parent:''},
  {id:'entrymeta:work_1:title',kind:'context',text:'Software developer',parent:'work_1'},
  {id:'entrymeta:work_1:organization',kind:'context',text:'Fictional Studio',parent:'work_1'},
  {id:'entrymeta:work_1:dates',kind:'context',text:'2022–2024',parent:'work_1'},
 ]};
}
test('summary content excludes listed skills and identity metadata, not candidate context',()=>{
 const s=source(),b=buildSummaryEvidenceBrief(s);
 assert.deepEqual(b.contentSourceIds,['summary','work_1_b1','education_1','context_1']);
 assert.deepEqual(b.identitySourceIds,['headline','entrymeta:work_1:title','entrymeta:work_1:organization','entrymeta:work_1:dates']);
 assert(!JSON.stringify(b).includes('skill_1'));
 assert(b.contentRole.includes('actual scope'));assert(b.identityRole.includes('not achievements'));
});
test('brief derives only reference roles; source facts, skill levels and qualifications stay untouched',()=>{
 const s=source(),before=JSON.stringify(s),b=buildSummaryEvidenceBrief(s);
 assert.equal(JSON.stringify(s),before);assert(!JSON.stringify(b).includes('Coursework only'));
 assert(!('score'in b));assert(!('targetFit'in b));assert(!('verified'in b));
 assert(b.skillsRole.includes('not summary-authoring evidence'));
});
test('explicit interest stays available; removing it does not create inferred interest evidence',()=>{
 const s=source();assert(buildSummaryEvidenceBrief(s).contentSourceIds.includes('summary'));
 s.evidence=s.evidence.filter(f=>f.id!=='summary');
 assert(!buildSummaryEvidenceBrief(s).contentSourceIds.includes('summary'));
 assert(!JSON.stringify(buildSummaryEvidenceBrief(s)).includes('accessible'));
});
test('qualifications and real-practice facts remain eligible without promoting a listed skill',()=>{
 const s=source();s.evidence.find(f=>f.id==='work_1_b1').text='Built a React interface for internal reports.';
 const b=buildSummaryEvidenceBrief(s);assert(b.contentSourceIds.includes('work_1_b1'));
 assert(b.contentSourceIds.includes('education_1'));assert(!b.contentSourceIds.includes('skill_1'));
});
test('locked summary has no authoring content or identity IDs; source is not removed',()=>{
 const s=source(),before=structuredClone(s.evidence);s.locks.summary=true;
 const b=buildSummaryEvidenceBrief(s);assert.deepEqual(b.contentSourceIds,[]);assert.deepEqual(b.identitySourceIds,[]);
 assert.deepEqual(s.evidence,before);
});
test('sparse and skill-only sources do not fabricate summary evidence',()=>{
 const s=source();s.evidence=s.evidence.filter(f=>['headline','skill_1'].includes(f.id));
 const b=buildSummaryEvidenceBrief(s);assert.deepEqual(b.contentSourceIds,[]);assert.deepEqual(b.identitySourceIds,['headline']);
 s.evidence=[];assert.deepEqual(buildSummaryEvidenceBrief(s).contentSourceIds,[]);
});
test('legacy brief shape remains unchanged; natural authoring alone adds the summary guidance',()=>{
 const s=source(),b=buildDocumentBrief(s);assert(!('summaryEvidence'in b));
 assert.equal(b.revision,'document-editorial-1');assert(code.includes('summaryEvidence: buildSummaryEvidenceBrief(base.source)'));
});
test('active prompt contains positive synthesis and same-source target contrasts, not another output stage',()=>{
 assert.equal(typeof instructions,'string');
 for(const p of ['SUMMARY PURPOSE:','COMPOSITION DECISION:','SYNTHETIC EDITORIAL CONTRASTS, NOT CANDIDATE FACTS:',
  'For a records-coordination job','For a workshop-support job','These are editorial contrasts, not sentence templates',
  'Use only the actual SOURCE','do not enumerate every relevant bullet','Useful factual overlap is expected'])
  assert(instructions.includes(p),p);
 for(const old of ['summaryBlocks','summaryClaims','hiddenPlanner','phasePlanner'])assert(!instructions.includes(old));
 assert(instructions.includes('one response'));assert(!code.includes('fetch('));
});
test('explicit-interest, distant-target and sparse-evidence limits remain instruction-only',()=>{
 for(const p of ['Personal interests, motivation and career direction are candidate facts too',
  'Neither a listed skill nor JOB establishes','With sparse evidence','With a distant target',
  'Preserve a strong existing summary','An empty array is allowed','not semantic verification'])
  assert(instructions.includes(p),p);
});
test('skill selection and hard preservation rules remain in the active request instructions',()=>{
 for(const p of ['retaining exact native names and levels','not a blanket rule deleting all non-programming skills',
  'unfinished degrees','course-only levels','Locked summary requires summarySegments:[]',
  'No edits to identity','A useful original bullet may stay unchanged','sourceIds'])
  assert(instructions.includes(p),p);
});
test('valid mixed-kind trace namespace is preserved instead of imposing a new rejection gate',()=>{
 assert(code.includes('const available = referencePolicy(source).summarySourceIds'));
 assert(code.includes('summarySourceIds'));assert(code.includes('skill IDs for trace compatibility'));
 assert(!code.includes('semanticStatus: \'verified\''));
});
// Instruction presence only: this cannot establish that a model follows the guidance.
test('SC3 prioritizes specific target-relevant narrative over a generic inherited opening',()=>{
 for(const text of ["Lead with the most target-relevant kind of work",
  "rather than the broadest description in the original summary",
  "do not preserve a vague opening merely because it is original",
  "Prefer a compact synthesis of related contributions",
  "Do not import archive work into other candidates or targets"])
  assert(instructions.includes(text),text);
 for(const text of ["Skill listings belong in the Skills section",
  "Workflow improvement does not establish runtime performance, debugging or automated testing",
  "Combining skill and work references does not establish a missing relationship",
  "Adjacent sentences must not imply a connection the source does not state"])
  assert(instructions.includes(text),text);
});
