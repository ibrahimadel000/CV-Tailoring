// Native compile/workflow tests with authored responses; no live provider calls.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {load}=require('./helpers/editorial-loader.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {createCompositionRunner}=load('services/resumeComposer/workflow');
const {resumeBlocks}=load('components/builder/resumeModel');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
function response(p) {
 const s=n.prepareNaturalComposition(p,job).source,facts=new Map(s.evidence.map(f=>[f.id,f]));
 return {summarySegments:[
  {text:'Software engineer working on internal web applications.',sourceIds:['work_1_b1']},
  {text:'Proficient in building and maintaining RESTful APIs using Python.',sourceIds:['work_1_b1','skill_1','skill_2']},
 ],entries:[...s.experience.filter(()=>!s.locks.experience),...s.projects.filter(()=>!s.locks.projects)].map(e=>({
  id:e.id,overview:e.overviewId?{text:facts.get(e.overviewId).text,sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},
  bullets:e.bulletIds.map(id=>({text:facts.get(id).text,sourceIds:[id]})),
 })),skillSelections:s.locks.skills?[]:[{id:'skill_1',category:'Languages'},{id:'skill_2',category:'Technical'}]};
}
test('active native compiler removes the listed-skill inflation and retains useful authored text',()=>{
 const p=fixture(),before=JSON.stringify(p),r=response(p),out=n.compileNaturalComposition(p,r);
 assert.equal(out.candidate.summary.data,r.summarySegments[0].text);
 assert.deepEqual(out.summarySegments,[r.summarySegments[0]]);
 assert.deepEqual(out.summaryTrace.map(s=>s.segmentIndex),[0]);
 assert.equal(out.summaryRemovals[0].segmentIndex,1);assert(out.warnings.some(w=>w.path==='summarySegments.1'));
 assert.equal(out.semanticStatus,'unassessed');assert.equal(JSON.stringify(p),before);
 for(const k of ['resumeHeader','headline','education','certifications','customSections','documentTheme','sectionOrder','pageLayout'])
  assert.deepEqual(out.candidate[k],p[k]);
 assert.deepEqual(out.candidate.experience,p.experience);
});
test('real practice is preserved and no removal notice is produced',()=>{
 const p=fixture();p.experience.data[0].bullets[0].text='Built and maintained RESTful APIs using Python.';
 const r=response(p);r.summarySegments=[{text:'Built and maintained RESTful APIs using Python.',sourceIds:['work_1_b1','skill_1','skill_2']}];
 const out=n.compileNaturalComposition(p,r);assert.equal(out.candidate.summary.data,r.summarySegments[0].text);
 assert.deepEqual(out.summaryRemovals,[]);assert.deepEqual(out.candidate.experience,p.experience);
});
test('explicit personal direction entered through the existing source editor is available as evidence',()=>{
 const p=fixture();p.summary.data='Interested in creating user-friendly web experiences.';
 const r=response(p);r.summarySegments=[{text:p.summary.data,sourceIds:['summary']}];
 assert.equal(n.compileNaturalComposition(p,r).candidate.summary.data,p.summary.data);
 assert(n.prepareNaturalComposition(p,job).source.evidence.some(f=>f.id==='summary'&&f.text===p.summary.data));
});
test('locked summary remains byte-for-byte original, even if it names listed-only skills',()=>{
 const p=fixture();p.summary.data='  Original React and Python wording  ';p.summary.isLocked=true;
 const r=response(p);r.summarySegments=[];
 const out=n.compileNaturalComposition(p,r);assert.deepEqual(out.candidate.summary,p.summary);assert.deepEqual(out.summaryRemovals,[]);
 // Claim guard: segments generated for a locked summary are ignored with a review note.
 r.summarySegments=[{text:'Python engineer.',sourceIds:['skill_1']}];
 const again=n.compileNaturalComposition(p,r);assert.deepEqual(again.candidate.summary,p.summary);
 assert(again.guardNotes.some(g=>g.path==='summary'&&g.kind==='ignored'));
});
// Claim guard: interpretable-but-flawed content no longer discards the whole document.
// Each defect is removed or restored with a review note; the original is never mutated.
test('malformed references, duplicate refs, oversized summaries and bad entries degrade gracefully with notes',()=>{
 for(const [label,[mutate,expect]]of Object.entries({
  unknownRef:[r=>r.summarySegments[1].sourceIds.push('unknown'),out=>out.guardNotes.some(g=>g.path==='summarySegments.1'&&g.kind==='removed')],
  duplicateRef:[r=>r.summarySegments[1].sourceIds.push('skill_1'),out=>out.summaryRemovals.some(x=>x.segmentIndex===1)],
  oversized:[r=>r.summarySegments=[{text:'x'.repeat(2400),sourceIds:['skill_1']},{text:'x',sourceIds:['skill_2']}],out=>out.guardNotes.some(g=>g.path==='summarySegments.1')],
  foreignBullet:[r=>r.entries[0].bullets[0].sourceIds=['skill_1'],out=>out.guardNotes.some(g=>g.path==='entries.work_1.bullets.0')],
 })){
  const p=fixture(),before=JSON.stringify(p),r=response(p);mutate(r);
  const out=n.compileNaturalComposition(p,r);assert(expect(out),label);assert.equal(JSON.stringify(p),before);
 }
});
test('when no generated summary passage survives, the original summary is kept with a note',()=>{
 const p=fixture(),r=response(p);r.summarySegments=r.summarySegments.slice(1);
 // Claim guard: nothing usable remains, so the candidate's own original summary is
 // restored; no fallback prose is invented.
 const out=n.compileNaturalComposition(p,r);assert.equal(out.candidate.summary.data,p.summary.data.trim());
 assert.equal(out.summaryRemovals.length,1);
 assert(out.warnings.some(w=>w.path==='summary'&&w.message.includes('no supported AI summary remained')));
});
test('front-end selection binds only source skills and omits unrelated skills only in the new copy',async()=>{
 const p=fixture();p.skills.data=[
  ['React','Tools'],['HTML','Languages'],['CSS','Languages'],['Digital Advertising','Technical'],['Copywriting','Soft'],
 ].map(([name,category])=>({id:crypto.randomUUID(),name,category,level:name==='React'?'Coursework only':''}));
 const before=JSON.stringify(p),r=response(p);r.summarySegments=r.summarySegments.slice(0,1);
 r.skillSelections=[{id:'skill_1',category:'Tools'},{id:'skill_3',category:'Languages'},{id:'skill_2',category:'Languages'}];
 let active=p,calls=0,profiles=[p];
 const runner=createCompositionRunner({readActive:()=>active,appendIfCurrent(snapshot,copy){
  assert.equal(snapshot,JSON.stringify(p));profiles.push(copy);active=copy;return true;
 }},async()=>{calls++;return r;});
 const out=await runner.run('Front-end developer: create accessible user interfaces. React, HTML and CSS are relevant.',new AbortController().signal);
 assert.equal(calls,1);assert.equal(out.status,'created');assert.equal(profiles.length,2);
 assert.equal(JSON.stringify(p),before);assert.notEqual(active.profileId,p.profileId);assert.equal(active.baseProfileId,p.profileId);
 assert.deepEqual(active.skills.data.map(s=>s.name),['React','CSS','HTML']);
 assert.equal(active.skills.data[0].level,'Coursework only');
 assert(out.omittedSourceIds.includes('skill_4'));assert(out.omittedSourceIds.includes('skill_5'));
 const reopened=JSON.parse(JSON.stringify(active));assert.deepEqual(reopened,active);
 const visible=JSON.stringify(resumeBlocks(reopened));assert(visible.includes('Coursework only'));assert(!visible.includes('Digital Advertising'));
 // JSON/visible-model check, not browser persistence or a real PDF.
});
test('workflow saves filtered text once and returns the visible-removal information',async()=>{
 const p=fixture(),before=JSON.stringify(p);let active=p,calls=0,saves=0;
 const runner=createCompositionRunner({readActive:()=>active,appendIfCurrent(snapshot,copy){
  assert.equal(snapshot,before);saves++;active=copy;return true;
 }},async()=>{calls++;return response(p);});
 const out=await runner.run(job,new AbortController().signal);
 assert.equal(calls,1);assert.equal(saves,1);assert.equal(out.summaryRemovals.length,1);
 assert(!active.summary.data.includes('RESTful'));assert.equal(JSON.stringify(p),before);
});
test('removal notice is outside collapsed review notes and is passed to the editor transition',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../src/components/builder/ComposerTailorWorkspace.tsx'),'utf8');
 const studio=fs.readFileSync(path.join(__dirname,'../src/components/builder/BuilderStudio.tsx'),'utf8');
 assert(ui.includes('summaryBoundaryNotice(result.summaryRemovals.length'));
 assert(ui.includes('onCreated(result.profileId, notice, reviewNotes)'));
 assert(studio.includes('notes: reviewNotes'));
 assert(studio.includes('compositionNotice.text'));assert(studio.includes('role="status"'));
 // Static wiring only; browser/mobile visibility still needs user-side checking.
});