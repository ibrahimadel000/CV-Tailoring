// Offline, synthetic regressions. No model calls or proof of real-world factuality.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {createCompositionRunner}=load('services/resumeComposer/workflow');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const B1='Designed and engineered resilient data dashboards and reporting architectures, connecting data sources with routine reporting tasks.';
const B2='Improved delivery workflows and development pipelines, reducing manual effort and improving review timelines.';
const SYN='Software engineer with a background in data dashboard development, reporting architecture and delivery workflow improvement.';
const unit=(text,sourceIds)=>({text,sourceIds});
function setup(){
 const p=fixture();p.headline.data='Software Engineer';p.resumeHeader.data.desiredJobPosition='Software Engineer';p.summary.data='I develop reporting tools and support project coordination.';
 p.experience.data[0].bullets=[B1,B2].map(text=>({id:crypto.randomUUID(),text,isVerified:true}));
 const s=n.prepareNaturalComposition(p,job).source,facts=new Map(s.evidence.map(x=>[x.id,x]));
 const r={summarySegments:[unit(B1,['work_1_b1']),unit(B2,['work_1_b2'])],
 alternativeSummarySegments:[unit(SYN,['headline','work_1_b1','work_1_b2'])],
 entries:[...s.experience.filter(()=>!s.locks.experience),...s.projects.filter(()=>!s.locks.projects)].map(e=>({id:e.id,
 overview:e.overviewId?{text:facts.get(e.overviewId).text,sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},
 bullets:e.bulletIds.map(id=>({text:facts.get(id).text,sourceIds:[id]}))})),
 skillSelections:s.locks.skills?[]:[{id:'skill_1',category:'Languages'}]};return {p,r};
}
test('two removed copies use a separately checked synthesized alternative',()=>{
 const {p,r}=setup(),before=JSON.stringify(p);const out=n.compileNaturalComposition(p,r,job);
 a.equal(out.candidate.summary.data,SYN);a.equal(JSON.stringify(p),before);
 a.deepEqual(out.summaryTrace[0].sources.map(x=>x.sourceId),['headline','work_1_b1','work_1_b2']);
 a(out.warnings.some(w=>w.path==='summary'&&w.message.includes('alternative AI summary')));
 a.equal(out.semanticStatus,'unassessed');a.deepEqual(out.candidate.experience,p.experience);
});
test('a surviving first summary remains first even when an alternative is present',()=>{
 const {p,r}=setup();r.summarySegments=[unit(SYN,['headline','work_1_b1','work_1_b2'])];
 r.alternativeSummarySegments=[unit('Unrelated second choice.',['work_1_b1'])];
 const out=n.compileNaturalComposition(p,r,job);a.equal(out.candidate.summary.data,SYN);
 a(!out.warnings.some(w=>w.message.includes('alternative AI summary')));
});
test('a rejected alternative cannot bypass unsupported number or copied text checks',()=>{
 const {p,r}=setup();r.alternativeSummarySegments=[unit('Managed 500 Kubernetes services.',['work_1_b1'])];
 let out=n.compileNaturalComposition(p,r,job);a.equal(out.candidate.summary.data,p.summary.data);
 a(out.warnings.some(w=>w.message.includes('alternative AI summary also did not pass')));
 r.alternativeSummarySegments=[unit(B1,['work_1_b1'])];out=n.compileNaturalComposition(p,r,job);a.equal(out.candidate.summary.data,p.summary.data);
});
test('an alternative without eligible narrative citations cannot replace the original',()=>{
 const {p,r}=setup();r.alternativeSummarySegments=[unit('I develop reporting tools and support project coordination.',['summary'])];
 const out=n.compileNaturalComposition(p,r,job);a.equal(out.candidate.summary.data,p.summary.data);
});
test('summary locks are respected even with a proposed alternative',()=>{
 const {p,r}=setup();p.summary.isLocked=true;p.summary.data='  Locked original  ';
 const out=n.compileNaturalComposition(p,r,job);a.deepEqual(out.candidate.summary,p.summary);
 const packet=n.prepareNaturalComposition(p,job);a.equal(packet.outputContract.properties.alternativeSummarySegments.maxItems,0);
});
test('empty alternative and older response shapes retain prior behavior',()=>{
 const {p,r}=setup();delete r.alternativeSummarySegments;const out=n.compileNaturalComposition(p,r,job);
 a.equal(out.candidate.summary.data,p.summary.data);a.equal(out.guardNotes.filter(x=>x.message.includes('repeats one experience/project passage')).length,2);
});
test('one provider call creates an editable separate copy with selected alternative',async()=>{
 const {p,r}=setup(),before=JSON.stringify(p);let active=p,calls=0;
 const runner=createCompositionRunner({readActive:()=>active,appendIfCurrent:(s,c)=>{a.equal(s,before);active=c;return true}},async packet=>{calls++;a(packet.outputContract.properties.alternativeSummarySegments);return r});
 const out=await runner.run(job,new AbortController().signal);a.equal(calls,1);a.equal(out.status,'created');a.equal(active.summary.data,SYN);
 a.equal(JSON.stringify(p),before);a.notEqual(active.profileId,p.profileId);a(active.compositionReview.notes.some(x=>x.includes('alternative AI summary')));
});

test('a fictional shortened first bullet triggers a checked two-contribution alternative',()=>{
 const {p,r}=setup();r.summarySegments=[
  unit('Software Engineer experienced in designing and engineering resilient data dashboards and reporting architectures.',['headline','work_1_b1']),
  unit(B2,['work_1_b2']),
 ];
 const out=n.compileNaturalComposition(p,r,job);
 a.equal(out.candidate.summary.data,SYN);
 a(out.warnings.some(w=>w.message.includes('first closely echoed one experience passage')));
 a.equal(out.semanticStatus,'unassessed');
});
test('a weak shortened primary is not deleted when a suitable alternate is unavailable',()=>{
 const {p,r}=setup();const primary='Software Engineer experienced in designing and engineering resilient data dashboards and reporting architectures.';
 r.summarySegments=[unit(primary,['headline','work_1_b1'])];r.alternativeSummarySegments=[];
 let out=n.compileNaturalComposition(p,r,job);a.equal(out.candidate.summary.data,primary);a(out.warnings.some(w=>w.message.includes('closely echoes one experience passage')));
 r.alternativeSummarySegments=[unit('Managed 500 Kubernetes services.',['work_1_b1'])];
 out=n.compileNaturalComposition(p,r,job);a.equal(out.candidate.summary.data,primary);a(out.warnings.some(w=>w.message.includes('closely echoes one experience passage')));
});
test('a weak primary is not swapped for an alternative with just one factual citation',()=>{
 const {p,r}=setup();const primary='Software Engineer experienced in designing and engineering resilient data dashboards and reporting architectures.';
 r.summarySegments=[unit(primary,['headline','work_1_b1'])];r.alternativeSummarySegments=[unit('Software engineer delivering data dashboards.',['work_1_b1'])];
 const out=n.compileNaturalComposition(p,r,job);a.equal(out.candidate.summary.data,primary);
});
test('weak-primary replacement requires literal support signals from each of two cited facts',()=>{
 const {p,r}=setup();const primary='Software Engineer experienced in designing and engineering resilient data dashboards and reporting architectures.';
 r.summarySegments=[unit(primary,['headline','work_1_b1'])];r.alternativeSummarySegments=[unit('Software engineer with data dashboards and a passion for leadership.',['work_1_b1','work_1_b2'])];
 const out=n.compileNaturalComposition(p,r,job);a.equal(out.candidate.summary.data,primary);
});
test('the shortened-echo signal is a limited editorial heuristic, not semantic verification',()=>{
 const {shortenedSourceEcho}=load('services/resumeComposer/terms');const facts=[{id:'a',text:B1},{id:'b',text:B2}];
 a(shortenedSourceEcho('Software Engineer experienced in designing and engineering resilient data dashboards and reporting architectures.',facts));
 a(!shortenedSourceEcho(SYN,facts));a(!shortenedSourceEcho('Built web apps.',facts));
});
test('a fabricated interest absent from citations cannot replace the weak primary',()=>{
 const {p,r}=setup();const primary='Software Engineer experienced in designing and engineering resilient data dashboards and reporting architectures.';
 r.summarySegments=[unit(primary,['headline','work_1_b1'])];
 r.alternativeSummarySegments=[unit('Software engineer passionate about data dashboard design and delivery workflow improvement.',['headline','work_1_b1','work_1_b2'])];
 const out=n.compileNaturalComposition(p,r,job);a.equal(out.candidate.summary.data,primary);
});
test('a cross-fact causal assertion cannot replace the weak primary',()=>{
 const {p,r}=setup();const primary='Software Engineer experienced in designing and engineering resilient data dashboards and reporting architectures.';
 r.summarySegments=[unit(primary,['headline','work_1_b1'])];
 r.alternativeSummarySegments=[unit('Software engineer: data dashboard development improved delivery workflow.',['headline','work_1_b1','work_1_b2'])];
 const out=n.compileNaturalComposition(p,r,job);a.equal(out.candidate.summary.data,primary);
});
test('word and citation coverage still cannot verify an implied relationship',()=>{
 const {p,r}=setup();r.summarySegments=[unit('Software Engineer experienced in designing and engineering resilient data dashboards and reporting architectures.',['headline','work_1_b1'])];
 const fabricated='Software engineer: data dashboard development for delivery workflows.';
 r.alternativeSummarySegments=[unit(fabricated,['headline','work_1_b1','work_1_b2'])];
 const out=n.compileNaturalComposition(p,r,job);
 // Even after the causal-word check, separate sourced words do not prove this relationship.
 a.equal(out.candidate.summary.data,fabricated);a.equal(out.semanticStatus,'unassessed');
});
