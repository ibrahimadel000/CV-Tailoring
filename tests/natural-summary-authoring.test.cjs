// Authored fixtures through actual packet/compiler/workflow. NOT generated-writing acceptance.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {createCompositionRunner}=load('services/resumeComposer/workflow');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
function response(p,summarySegments){
 const s=n.prepareNaturalComposition(p,job).source,facts=new Map(s.evidence.map(f=>[f.id,f]));
 return {summarySegments,entries:[...s.experience.filter(()=>!s.locks.experience),...s.projects.filter(()=>!s.locks.projects)].map(e=>({
  id:e.id,overview:e.overviewId?{text:facts.get(e.overviewId).text,sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},
  bullets:e.bulletIds.map(id=>({text:facts.get(id).text,sourceIds:[id]})),
 })),skillSelections:s.locks.skills?[]:[{id:'skill_1',category:'Languages'}]};
}
const unit=(text,sourceIds)=>({text,sourceIds});
test('native packet aligns summary-content guidance while retaining source and full trace namespace',()=>{
 const p=fixture(),packet=n.prepareNaturalComposition(p,job),b=packet.documentBrief.summaryEvidence;
 const expected=packet.source.evidence.filter(f=>f.kind!=='skill'&&f.kind!=='headline'&&!f.id.startsWith('entrymeta:')).map(f=>f.id);
 assert.deepEqual(b.contentSourceIds,expected);assert(b.contentSourceIds.includes('work_1_b1'));
 assert(!b.contentSourceIds.some(id=>packet.source.skillIds.includes(id)));
 assert(packet.source.skillIds.includes('skill_1'));assert(packet.source.evidence.some(f=>f.id==='skill_1'));
 const schema=n.googleNaturalSchema(packet),ids=packet.outputContract.properties.summarySegments.items.properties.sourceIds.items.enum;
 assert(ids.includes('skill_1'));assert.deepEqual(schema.properties.summarySegments.items.properties.sourceIds.items.enum,ids);
 assert.equal(packet.revision,'document-compose-natural-segments-4-capability-separation');
});
test('different job focus leaves actual evidence unchanged and never adds candidate facts',()=>{
 const p=fixture(),before=JSON.stringify(p),a=n.prepareNaturalComposition(p,job);
 const b=n.prepareNaturalComposition(p,'Developer onboarding role: deliver workshops and explain software concepts to new developers.');
 assert.deepEqual(a.source,b.source);assert.deepEqual(a.documentBrief,b.documentBrief);assert.notEqual(a.job,b.job);
 assert.equal(JSON.stringify(p),before);assert(!JSON.stringify(a.documentBrief).includes('SYNTHETIC STYLE CONTRASTS'));
});
test('manually authored software-development overview compiles without copying work bullets',()=>{
 const p=fixture(),text='Software engineer combining web application development with improvements to delivery workflows.';
 const r=response(p,[unit(text,['headline','work_1_b1','work_1_b2'])]),out=n.compileNaturalComposition(p,r);
 assert.equal(out.candidate.summary.data,text);assert.deepEqual(out.candidate.experience,p.experience);
 assert(!p.experience.data[0].bullets.some(b=>b.text===text));assert.equal(out.semanticStatus,'unassessed');
});
test('manually authored onboarding focus uses existing developer work and training, not a new role',()=>{
 const p=fixture(),text='Software engineer with a background in web application development and developer onboarding.';
 const out=n.compileNaturalComposition(p,response(p,[unit(text,['headline','work_1_b1','work_1_b3'])]));
 assert.equal(out.candidate.summary.data,text);assert.deepEqual(out.candidate.resumeHeader,p.resumeHeader);
 assert.equal(out.candidate.experience.data[0].roleTitle,'Software Engineer');
});
test('real practice with mixed narrative and skill references stays compatible',()=>{
 const p=fixture();p.experience.data[0].bullets[0].text='Built and maintained RESTful APIs using Python.';
 const r=response(p,[unit('Software engineer with experience building RESTful APIs using Python.',['headline','work_1_b1','skill_1','skill_2'])]);
 const out=n.compileNaturalComposition(p,r);
 assert.equal(out.candidate.summary.data,r.summarySegments[0].text);assert.deepEqual(out.summaryRemovals,[]);
 assert(out.summaryTrace[0].sources.some(f=>f.kind==='skill'));assert.equal(out.semanticStatus,'unassessed');
});
test('listed-only API inflation is still removed by the existing boundary, not rewritten',()=>{
 const p=fixture(),r=response(p,[unit('Proficient in building RESTful APIs using Python.',['work_1_b1','skill_1','skill_2'])]);
 const out=n.compileNaturalComposition(p,r);assert.equal(out.candidate.summary.data,'');
 assert.equal(out.summaryRemovals.length,1);assert.equal(out.semanticStatus,'unassessed');
 assert.deepEqual(out.candidate.experience,p.experience);
});
test('explicit interest can be used while absent interest is not fabricated in the packet',()=>{
 const p=fixture();p.summary.data='';
 assert(!n.prepareNaturalComposition(p,job).documentBrief.summaryEvidence.contentSourceIds.includes('summary'));
 p.summary.data='Interested in accessible web interfaces.';
 const packet=n.prepareNaturalComposition(p,job);assert(packet.documentBrief.summaryEvidence.contentSourceIds.includes('summary'));
 const out=n.compileNaturalComposition(p,response(p,[unit(p.summary.data,['summary'])]));
 assert.equal(out.candidate.summary.data,p.summary.data);
});
test('coursework and unfinished-degree scope survive packet, authored summary and native skill binding',()=>{
 const p=fixture();p.skills.data[0].level='Coursework only';
 Object.assign(p.education.data[0],{degree:'B.Sc. Computer Science (in progress)',description:'Python coursework only.'});
 const text='Computer science studies in progress, including Python coursework only.';
 const packet=n.prepareNaturalComposition(p,job);
 assert(packet.source.evidence.find(f=>f.id==='skill_1').text.includes('Coursework only'));
 assert(packet.documentBrief.summaryEvidence.contentSourceIds.includes('education_1'));
 const out=n.compileNaturalComposition(p,response(p,[unit(text,['education_1'])]));
 assert.equal(out.candidate.summary.data,text);assert.equal(out.candidate.skills.data[0].level,'Coursework only');
 assert.deepEqual(out.candidate.education,p.education);
});
test('empty and locked summaries retain existing behavior without a generated fallback',()=>{
 const p=fixture();let out=n.compileNaturalComposition(p,response(p,[]));assert.equal(out.candidate.summary.data,'');
 p.summary.data='  Exact original summary  ';p.summary.isLocked=true;
 const packet=n.prepareNaturalComposition(p,job);assert.deepEqual(packet.documentBrief.summaryEvidence.contentSourceIds,[]);
 assert.deepEqual(packet.documentBrief.summaryEvidence.identitySourceIds,[]);
 out=n.compileNaturalComposition(p,response(p,[]));assert.deepEqual(out.candidate.summary,p.summary);
 assert.throws(()=>n.compileNaturalComposition(p,response(p,[unit('New text.',['work_1_b1'])])),/Locked summary/);
});
test('modified summary guidance is still part of the authoritative packet binding',()=>{
 const packet=n.prepareNaturalComposition(fixture(),job);
 packet.documentBrief.summaryEvidence.contentSourceIds.push('skill_1');
 assert.throws(()=>n.googleNaturalSchema(packet),/contract mismatch/);
});
test('one mock invocation yields one separate native copy; original, locks, IDs and design remain intact',async()=>{
 const p=fixture();p.projects.isLocked=true;const snapshot=JSON.stringify(p);
 let active=p,calls=0,saves=0;const text='Software engineer combining web application development with improvements to delivery workflows.';
 const run=createCompositionRunner({readActive:()=>active,appendIfCurrent(s,copy){
  assert.equal(s,snapshot);saves++;active=copy;return true;
 }},async packet=>{calls++;assert(packet.documentBrief.summaryEvidence);n.googleNaturalSchema(packet);
  return response(p,[unit(text,['headline','work_1_b1','work_1_b2'])]);});
 const out=await run.run(job,new AbortController().signal);
 assert.equal(out.status,'created');assert.equal(calls,1);assert.equal(saves,1);assert.equal(JSON.stringify(p),snapshot);
 assert.notEqual(active.profileId,p.profileId);assert.equal(active.baseProfileId,p.profileId);
 for(const k of ['resumeHeader','headline','experience','projects','education','certifications','documentTheme','customSections'])
  assert.deepEqual(active[k],p[k],k);
 assert.equal(active.summary.data,text);assert.equal(out.semanticStatus,'unassessed');
});
test('guidance is not a semantic gate: invented interest and copied bullets still require editorial review',()=>{
 const p=fixture();
 for(const segment of [unit('Passionate about interface design.',['work_1_b1']),unit(p.experience.data[0].bullets[0].text,['work_1_b1'])]){
  const out=n.compileNaturalComposition(p,response(p,[segment]));
  assert.equal(out.candidate.summary.data,segment.text);assert.equal(out.semanticStatus,'unassessed');
 }
 // Passing here exposes the known gap; it is NOT acceptance of either prose sample.
});
// SC3 editorial reference cases: authored by hand, NOT generated-writing evidence.
test('SC3 compact architecture and delivery overview survives the unchanged native boundary',()=>{
 const p=fixture(),before=JSON.stringify(p);
 p.summary.data='I work at the intersection of technology and management.';
 const snapshot=JSON.stringify(p);
 const text='Software engineer with a background in web application development, technical architecture and delivery workflow improvement.';
 const out=n.compileNaturalComposition(p,response(p,[unit(text,['headline','work_1_b1','work_1_b2'])]));
 assert.equal(out.candidate.summary.data,text);assert.deepEqual(out.summaryRemovals,[]);
 assert.deepEqual(out.summaryTrace[0].sources.map(f=>f.sourceId),['headline','work_1_b1','work_1_b2']);
 assert.deepEqual(out.candidate.experience,p.experience);assert.equal(JSON.stringify(p),snapshot);
 assert.equal(out.semanticStatus,'unassessed');assert.notEqual(before,snapshot);
 for(const absent of ['Python','RESTful APIs','MySQL','automated testing','performance optimization'])
  assert(!out.candidate.summary.data.includes(absent));
});
test('SC3 does not disguise prompt guidance as an automatic editorial rejection or rewrite',()=>{
 const p=fixture();p.summary.data='I work at the intersection of technology and management.';
 const generic=unit(p.summary.data,['summary']);
 const out=n.compileNaturalComposition(p,response(p,[generic]));
 assert.equal(out.candidate.summary.data,generic.text);assert.deepEqual(out.summaryRemovals,[]);
 assert.equal(out.semanticStatus,'unassessed');
 // This is a documented limitation: generic but source-supported prose still compiles.
 // Only a later explicitly budgeted real output can establish editorial improvement.
});
