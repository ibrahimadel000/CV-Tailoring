// Fictional offline provider responses; no private content or network.
const { test } = require('node:test'), a = require('node:assert/strict');
const { load } = require('./helpers/editorial-loader.cjs');
const n = load('services/resumeComposer/naturalDocument');
const { createCompositionRunner } = load('services/resumeComposer/workflow');
const { fixture, job } = require('./helpers/composer-editorial-v4-fixture.cjs');
const notice = x => x.warnings.filter(w => w.message.includes('primary AI draft had no summary'));
function response(p) {
 const s=n.prepareNaturalComposition(p,job).source, f=new Map(s.evidence.map(x=>[x.id,x.text]));
 return {summarySegments:[], entries:s.experience.filter(()=>!s.locks.experience).map(e=>({id:e.id,overview:e.overviewId?{text:f.get(e.overviewId),sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))})), skillSelections:s.locks.skills?[]:s.skillIds.map(id=>({id,category:s.evidence.find(e=>e.id===id).profileCategory}))};
}
function rig(p, make) {let active=p, copy; return {run:createCompositionRunner({readActive:()=>active,appendIfCurrent:(snap,c)=>{if(JSON.stringify(active)!==snap)return false;active=copy=c;return true;}},async packet=>make(packet)).run,getCopy:()=>copy};}
test('empty primary with skills-only edit creates copy and records fallback note',async()=>{
 const p=fixture(),before=JSON.stringify(p),doc=response(p);doc.skillSelections.reverse();
 const r=rig(p,()=>doc),out=await r.run(job,new AbortController().signal);
 a.equal(out.status,'created');a.equal(JSON.stringify(p),before);a.equal(out.candidate.summary.data,p.summary.data.trim());a.deepEqual(out.candidate.experience,p.experience);a.notDeepEqual(out.candidate.skills.data,p.skills.data);
 a.equal(notice(out).length,1);a(out.candidate.compositionReview.notes.some(n=>n.includes('primary AI draft had no summary')));
});
test('empty primary and no other edit returns notice without duplicate',async()=>{
 const p=fixture();p.skills.data=p.skills.data.slice(0,1); const r=rig(p,()=>response(p)),out=await r.run(job,new AbortController().signal);
 a.equal(out.status,'unchanged');a.equal(r.getCopy(),undefined);a.equal(notice(out).length,1);
});
test('empty primary with locked or empty source summary gets no fallback notice',()=>{
 for(const type of ['locked','empty','whitespace']) {const p=fixture();if(type==='locked')p.summary.isLocked=true;else p.summary.data=type==='empty'?'':'   '; const out=n.compileNaturalComposition(p,response(p),job);a.equal(notice(out).length,0,type);}
});
test('a rejected primary receives its existing removal explanation, not empty-draft notice',()=>{
 const p=fixture(),doc=response(p);doc.summarySegments=[{text:'Managed 999 Kubernetes clusters.',sourceIds:['work_1_b1']}];const out=n.compileNaturalComposition(p,doc,job);
 a.equal(notice(out).length,0);a(out.warnings.some(w=>/original summary|Removed a generated summary/.test(w.message)));
});
test('valid alternative selected after empty primary does not say source summary remained',()=>{
 const p=fixture(),doc=response(p);doc.alternativeSummarySegments=[{text:'Engineer with experience building web applications.',sourceIds:['work_1_b1']}];const out=n.compileNaturalComposition(p,doc,job);
 a.equal(out.candidate.summary.data,doc.alternativeSummarySegments[0].text);a.equal(notice(out).length,0);a(out.warnings.some(w=>w.message.includes('alternative AI summary because the primary draft had no summary')));
});
test('source-wording mode filters the generated summary fallback notice',async()=>{
 const p=fixture(),doc=response(p);doc.skillSelections.reverse();const out=await rig(p,()=>doc).run(job,new AbortController().signal,{exactSourceWording:true});
 a.equal(notice(out).length,0);a(out.warnings.some(w=>w.path==='sourceWording'));
});

test('fallback trims surrounding whitespace and reports wording rather than byte identity',()=>{
 const p=fixture();p.summary.data='  Fictional archivist helping visitors.  ';const out=n.compileNaturalComposition(p,response(p),job);
 a.equal(out.candidate.summary.data,p.summary.data.trim());a.equal(notice(out).length,1);
});
test('rejected alternative after an empty primary keeps source and explains fallback once',()=>{
 const p=fixture(),doc=response(p);doc.alternativeSummarySegments=[{text:'Managed 999 Kubernetes clusters.',sourceIds:['work_1_b1']}];
 const out=n.compileNaturalComposition(p,doc,job);a.equal(out.candidate.summary.data,p.summary.data.trim());a.equal(notice(out).length,1);
});
test('an original-summary echo is a nonempty draft, not an empty one',()=>{
 const p=fixture(),doc=response(p);doc.summarySegments=[{text:p.summary.data.trim(),sourceIds:['summary']}];
 const out=n.compileNaturalComposition(p,doc,job);a.equal(notice(out).length,0);
});
