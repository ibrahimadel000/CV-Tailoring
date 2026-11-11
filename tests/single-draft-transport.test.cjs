// Fictional, offline only. These exercise transport and compilation, not AI quality.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs'),{fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument'),d=load('services/resumeComposer/singleDraftRequest');
const {createCompositionRunner}=load('services/resumeComposer/workflow');
function setup(){const p=fixture();p.experience.data[0].bullets[0].text='Was responsible for the organization of weekly team meetings for coordinating project updates.';p.experience.data[0].bullets[1].text='Built a classroom-only reporting tool.';p.skills.data[0].level='Coursework only';const packet=n.prepareNaturalComposition(p,job),source=packet.source, facts=new Map(source.evidence.map(x=>[x.id,x.text]));const response={summarySegments:[{text:'Software Engineer with experience organizing team meetings and building a classroom-only reporting tool.',sourceIds:['headline','work_1_b1','work_1_b2']}],entries:source.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:facts.get(id),sourceIds:[id]}))})),skillSelections:[{id:'skill_1',category:'Languages'}]};response.entries[0].bullets[0].text='Organized weekly team meetings to coordinate project updates.';return {p,packet,source,response};}
test('new wire includes full exact source and job once; schema requests one draft only',()=>{const {packet,source}=setup(),p=d.prepareSingleDraftRequest(packet),w=JSON.parse(p.wire);a.deepEqual(w.source,source);a.equal(w.job,packet.job);a.deepEqual(w.referencePolicy,packet.referencePolicy);a(!('documentBrief'in w));a(!('outputContract'in w));a.deepEqual(p.responseSchema.required,['summarySegments','entries','skillSelections']);a(!('alternativeEntries'in p.responseSchema.properties));a(!('alternativeSummarySegments'in p.responseSchema.properties));for(const f of source.evidence.filter(x=>x.kind==='achievement'&&x.text.length>30)){a.equal(p.wire.split(JSON.stringify(f.text)).length-1,1);}a(d.singleDraftInstructions.length<8400);});
test('all source and derived packet tampering fails preflight',()=>{for(const mutate of [p=>p.source.evidence.find(f=>f.id==='work_1_b1').text='tampered',p=>p.job='',p=>p.referencePolicy.skillIds.push('bogus'),p=>p.documentBrief.summaryEvidence.primaryFacts[0].text='tampered',p=>p.outputContract.required=[]]){const {packet}=setup();mutate(packet);a.throws(()=>d.prepareSingleDraftRequest(packet));}});
test('locked sections stay locked in projected schema and native compiler',()=>{const {p}=setup();p.summary.isLocked=true;p.experience.isLocked=true;p.skills.isLocked=true;const packet=n.prepareNaturalComposition(p,job),q=d.prepareSingleDraftRequest(packet);a.equal(q.responseSchema.properties.summarySegments.maxItems,0);a.equal(q.responseSchema.properties.skillSelections.maxItems,0);const raw={summarySegments:[],entries:[],skillSelections:[]},o=n.compileNaturalComposition(p,raw,job);a.deepEqual(o.candidate.summary,p.summary);a.deepEqual(o.candidate.experience,p.experience);a.deepEqual(o.candidate.skills,p.skills);});
test('a faithful fictional edit is retained; exact original and limits are preserved',()=>{const {p,response}=setup(),before=JSON.stringify(p),o=n.compileNaturalComposition(p,response,job);a.equal(o.candidate.experience.data[0].bullets[0].text,'Organized weekly team meetings to coordinate project updates.');a.equal(o.candidate.experience.data[0].bullets[1].text,'Built a classroom-only reporting tool.');a.equal(JSON.stringify(p),before);a.equal(o.semanticStatus,'unassessed');});
test('new technology, numbers, and foreign citations do not silently rewrite a fictional entry',()=>{for(const [text,ids] of [['Built RESTful APIs using Python.',['work_1_b1']],['Organized 999 weekly team meetings.',['work_1_b1']],['Organized team meetings.',['skill_1']]]){const {p,response}=setup();response.entries[0].bullets[0]={text,sourceIds:ids};const out=n.compileNaturalComposition(p,response,job);a(!out.candidate.experience.data[0].bullets.some(b=>b.text===text));a(out.warnings.length);}});
test('malformed result does not produce a copy or trigger another request',async()=>{const {p}=setup();let calls=0,saves=0;const run=createCompositionRunner({readActive:()=>p,appendIfCurrent:()=>{saves++;return true}},async packet=>{calls++;d.prepareSingleDraftRequest(packet);return {summarySegments:[],skillSelections:[]};});await a.rejects(run.run(job,new AbortController().signal));a.equal(calls,1);a.equal(saves,0);});
test('one fictional single-draft result produces a separate editable copy',async()=>{const {p,response}=setup(),before=JSON.stringify(p);let active=p,calls=0,saves=0;const run=createCompositionRunner({readActive:()=>active,appendIfCurrent:(snapshot,copy)=>{a.equal(snapshot,before);saves++;active=copy;return true}},async packet=>{calls++;d.prepareSingleDraftRequest(packet);return response});const out=await run.run(job,new AbortController().signal);a.equal(out.status,'created');a.equal(calls,1);a.equal(saves,1);a.notEqual(active.profileId,p.profileId);a.equal(JSON.stringify(p),before);a.equal(active.experience.data[0].bullets[0].text,response.entries[0].bullets[0].text);});
test('the active prompt includes hard source boundaries and avoids requiring alternative output',()=>{for(const phrase of ['JOB describes a vacancy, not the candidate','A listed skill does not prove','Preserve incomplete degrees','headline or entrymeta title','Do not copy [link omitted]','not independent proof'])a(d.singleDraftInstructions.includes(phrase),phrase);a(!d.singleDraftInstructions.includes('alternativeEntries'));});
test('embedded contact and credential patterns stop the source before a request without revealing values',()=>{
 for(const [field,value] of [
  ['bullet','Contact: writer@example.invalid'],
  ['summary','Mobile: +1 (212) 555-0199'],
  ['bullet','Key: AIza123456789012345678901234567890'],
  ['headline','mail me at owner@example.invalid'],
  ['title','Phone: 212-555-0199'],
 ]){
  const {p}=setup();
  if(field==='bullet') p.experience.data[0].bullets[0].text=value;
  if(field==='summary') p.summary.data=value;
  if(field==='headline') p.resumeHeader.data.desiredJobPosition=value;
  if(field==='title') p.experience.data[0].roleTitle=value;
  const packet=n.prepareNaturalComposition(p,job),before=JSON.stringify(p);
  a.throws(()=>d.prepareSingleDraftRequest(packet),err=>err.code==='input'&&err.message.includes('Nothing was sent')&&!err.message.includes(value));
  a.equal(JSON.stringify(p),before);
 }
});
test('preflight permits ordinary metrics, technologies and emails in the job, not source',()=>{
 const {p}=setup();p.experience.data[0].bullets[0].text='Processed 123456789 records with Python 3.12.';
 const packet=n.prepareNaturalComposition(p,'Backend opening: apply to hiring@example.invalid; improve data processing with Python.');
 a.doesNotThrow(()=>d.prepareSingleDraftRequest(packet));
});


test('prompt ranks by the actual occupation without importing job requirements as facts',()=>{
 for(const phrase of ["relevance to JOB's responsibilities and qualifications","whether technical or nontechnical","never keyword-stuff or claim missing requirements","without inventing or forcing any of them","Do not force English grammar or translate solely to match JOB"]) a(d.singleDraftInstructions.includes(phrase),phrase);
 a(!d.singleDraftInstructions.includes("JOB's core technical and delivery work"));
});
