// Summary/overview duplication guard: offline authored fixtures only, no provider calls.
// The reviewed PDF repeated experience bullets nearly verbatim; its source is
// unknown. Literal term/number grounding alone does not detect copied wording.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {copiedPassage}=load('services/resumeComposer/terms');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');

const B1='Designed and engineered resilient data dashboards and reporting architectures, connecting data sources with routine reporting tasks.';
const B2='Aligned reporting goals with technical execution through project coordination and cross-functional collaboration.';
const B3='Improved delivery workflows and development pipelines, reducing manual effort and improving review timelines.';
const ORIGINAL_SUMMARY='I develop reporting tools and support project coordination, handling technical tasks while supporting organized workflows.';

function profile(){
 const p=fixture();
 p.summary.data=ORIGINAL_SUMMARY;
 p.experience.data[0].bullets=[B1,B2,B3].map(text=>({id:crypto.randomUUID(),text,isVerified:true}));
 return p;
}
function response(p,summarySegments,overview){
 const s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x]));
 return {summarySegments,
 entries:s.experience.filter(()=>!s.locks.experience).map(e=>({id:e.id,
  overview:overview??{text:'',sourceIds:[]},
  bullets:e.bulletIds.map(id=>({text:f.get(id).text,sourceIds:[id]}))})),
 skillSelections:s.locks.skills?[]:[{id:'skill_1',category:'Languages'},{id:'skill_2',category:'Technical'},{id:'skill_3',category:'Tools'}]};
}

test('verbatim bullet copies in the summary are removed and the original summary kept',()=>{
 const p=profile(),before=JSON.stringify(p);
 const r=response(p,[
  {text:B1,sourceIds:['work_1_b1']},
  {text:B3,sourceIds:['work_1_b3']},
 ]);
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.summary.data,ORIGINAL_SUMMARY,'no usable introduction survives, so the original summary stays');
 a.equal(out.guardNotes.filter(g=>g.kind==='removed'&&g.message.includes('repeats one experience/project passage')).length,2);
 a(out.warnings.some(w=>w.message.includes('Kept your original summary')));
 a.deepEqual(out.candidate.experience.data[0].bullets.map(b=>b.text),[B1,B2,B3],'bullets themselves untouched');
 a.equal(JSON.stringify(p),before,'source never mutated');
});

test('a lightly reworded copy is still a copy',()=>{
 const p=profile();
 const reworded='Designed and engineered resilient data dashboards plus modern reporting architectures, connecting data sources with routine reporting tasks.';
 const r=response(p,[{text:reworded,sourceIds:['work_1_b1']}]);
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.summary.data,ORIGINAL_SUMMARY);
 a(out.guardNotes.some(g=>g.kind==='removed'&&g.path==='summarySegments.0'));
});

test('a vague opening followed by a copied bullet in one sentence is removed',()=>{
 const p=profile();
 const text='Experienced software engineer with a strong delivery record. '+B1;
 const r=response(p,[{text,sourceIds:['work_1_b1']}]);
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.summary.data,ORIGINAL_SUMMARY);
 a(out.guardNotes.some(g=>g.kind==='removed'&&g.message.includes('repeats one experience/project passage')));
});

test('a synthesized cross-bullet introduction is retained with zero duplication notes',()=>{
 const p=profile();
 // Recorded-trial style: shares fragments with several bullets, copies none.
 const synthesized='Software engineer focused on designing resilient data dashboards and aligning technical execution with operational goals.';
 const r=response(p,[{text:synthesized,sourceIds:['headline','work_1_b1','work_1_b2']}]);
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.summary.data,synthesized);
 a.equal(out.guardNotes.filter(g=>g.message.includes('repeats one experience/project passage')).length,0);
});

test('short passages and genuine synthesis never trigger the copy signal',()=>{
 a.equal(copiedPassage('Short text.',[{id:'x',text:'Short text.'}]),undefined,'below the minimum shared length');
 a.equal(copiedPassage('Built web apps and architectures.',[{id:'x',text:'Built web apps and architectures.'}]),undefined,'six-token floor not met');
 a(copiedPassage(B1,[{id:'x',text:B1}]),'verbatim long passage flagged');
 a.equal(copiedPassage('Web applications, reporting architectures and workflow automation for business operations.',[{id:'x',text:B1}]),undefined,'reordered synthesis is not an ordered copy');
});

test('an AI overview repeating its own bullet restores the original overview with a note',()=>{
 const p=profile();
 p.experience.data[0].description='Engineering role covering application design and delivery workflows.';
 const r=response(p,[
  {text:'Software engineer combining application design with workflow improvement.',sourceIds:['work_1_b1','work_1_b3']},
 ],{text:'Designed and engineered resilient data dashboards and reporting architectures, connecting data sources with routine reporting tasks.',sourceIds:['work_1_b1']});
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.experience.data[0].description,'Engineering role covering application design and delivery workflows.');
 a(out.guardNotes.some(g=>g.kind==='restored'&&g.path==='entries.work_1.overview'&&g.message.includes('repeated one of this entry')));
});

test('an unchanged original overview is never flagged as an AI copy',()=>{
 const p=profile();
 p.experience.data[0].description=B1; // user's own overview already resembles the bullet
 const s=n.prepareNaturalComposition(p,job).source;
 const original=s.evidence.find(e=>e.id==='work_1_overview').text;
 const r=response(p,[
  {text:'Software engineer combining application design with workflow improvement.',sourceIds:['work_1_b1','work_1_b3']},
 ],{text:original,sourceIds:['work_1_overview']});
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.experience.data[0].description,B1);
 a.equal(out.guardNotes.filter(g=>g.path==='entries.work_1.overview'&&g.message.includes('repeated one of this entry')).length,0);
});

test('a short cited contribution within a broader two-contribution synthesis is not discarded as a copied summary',()=>{
 const p=profile();
 p.experience.data[0].bullets=[
  {id:crypto.randomUUID(),text:'Built backend services for local community organizations.',isVerified:true},
  {id:crypto.randomUUID(),text:'Improved delivery workflows and supported developer onboarding workshops.',isVerified:true},
 ];
 const text='Built backend services for local community organizations and improved delivery workflows while supporting developer onboarding workshops.';
 const out=n.compileNaturalComposition(p,response(p,[{text,sourceIds:['work_1_b1','work_1_b2']}]));
 a.equal(out.candidate.summary.data,text);
 a.equal(out.guardNotes.filter(g=>g.message.includes('repeats one experience/project passage')).length,0);
});
