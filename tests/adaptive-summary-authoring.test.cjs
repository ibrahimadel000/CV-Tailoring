// Fictional, manually authored responses. Prompt and compiler behavior only;
// these tests do not establish actual model writing quality or factuality.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const d=load('services/resumeComposer/singleDraftRequest');
function response(p,segments) {
 const s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 return {summarySegments:segments,entries:[...s.experience,...s.projects].filter(e=>!(e.id.startsWith('work_')?s.locks.experience:s.locks.projects)).map(e=>({id:e.id,overview:e.overviewId?{text:f.get(e.overviewId),sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))})),skillSelections:[]};
}
const segment=(text,sourceIds)=>({text,sourceIds});
function sparse(){const p=fixture();p.headline.data='Software Engineer';p.resumeHeader.data.desiredJobPosition='Software Engineer';p.summary.data='';p.experience.data[0].bullets=[{id:crypto.randomUUID(),text:'Reviewed incident trends for operations teams in weekly reports.',isVerified:true}];p.projects.data=[];p.education.data=[];p.certifications.data=[];p.skills.data=[];return p;}
test('active request permits evidence-proportional summaries without irrelevant citations',()=>{
 const text=d.singleDraftInstructions;
 for(const phrase of ['no fixed number of sentences or source facts','a single supported fact is enough','Do not add irrelevant citations','A listed skill does not prove','Preserve incomplete degrees','Do not imply specialization or use the target job title','Do not promote an introductory certificate'])a(text.includes(phrase),phrase);
 for(const obsolete of ['MUST combine and cite at least TWO distinct IDs','Never write a summary sentence whose work content comes from a single bullet','concise 2-sentence summary'])a(!text.includes(obsolete),obsolete);
});
test('one real contribution can support one concise introduction without invented qualifications',()=>{
 const p=sparse(),before=JSON.stringify(p),packet=n.prepareNaturalComposition(p,job),wire=JSON.parse(d.prepareSingleDraftRequest(packet).wire);
 a.deepEqual(wire.guide.primaryFactIds,['work_1_b1']);a.deepEqual(wire.guide.qualificationFactIds,[]);
 const text='Software Engineer with experience reviewing incident trends for operations teams.';
 const out=n.compileNaturalComposition(p,response(p,[segment(text,['headline','work_1_b1'])]),job);
 a.equal(out.candidate.summary.data,text);a.equal(out.semanticStatus,'unassessed');a.equal(JSON.stringify(p),before);
});
test('a useful original summary identical to a work passage is not treated as generated copying',()=>{
 const p=fixture();p.headline.data='Software Engineer';p.resumeHeader.data.desiredJobPosition='Software Engineer';p.experience.data[0].bullets[0].text='Reviewed incident trends for operations teams in weekly reports.';p.summary.data=p.experience.data[0].bullets[0].text;
 const raw=response(p,[segment(p.summary.data,['summary','work_1_b1'])]);
 raw.alternativeSummarySegments=[segment('Software Engineer combining delivery workflow improvements with technical onboarding workshops.',['headline','work_1_b2','work_1_b3'])];
 const standalone=n.compileNaturalComposition(p,response(p,raw.alternativeSummarySegments),job);
 a.equal(standalone.candidate.summary.data,raw.alternativeSummarySegments[0].text,'alternative must independently survive checks');
 const before=JSON.stringify(p),out=n.compileNaturalComposition(p,raw,job);
 a.equal(out.candidate.summary.data,p.summary.data);
 a(!out.guardNotes.some(g=>g.path==='summarySegments.0'&&g.message.includes('repeats one experience')));
 a(!out.warnings.some(w=>w.message.includes('Used the alternative AI summary')));
 a.equal(JSON.stringify(p),before);
});
test('a newly generated verbatim work bullet still does not masquerade as an introduction',()=>{
 const p=fixture();p.summary.data='Original introduction.';p.experience.data[0].bullets[0].text='Reviewed incident trends for operations teams in weekly reports.';
 const out=n.compileNaturalComposition(p,response(p,[segment(p.experience.data[0].bullets[0].text,['work_1_b1'])]),job);
 a.equal(out.candidate.summary.data,p.summary.data);a(out.guardNotes.some(g=>g.path==='summarySegments.0'&&g.kind==='removed'));
});
test('a richer source can still support focused synthesis and keeps cited qualifications distinct',()=>{
 const p=fixture(),text='Software engineer combining web application development with delivery workflow improvements.';
 const out=n.compileNaturalComposition(p,response(p,[segment(text,['headline','work_1_b1','work_1_b2'])]),job);
 a.equal(out.candidate.summary.data,text);a.equal(out.semanticStatus,'unassessed');
});
test('skill-only evidence does not become practice, and a locked summary stays exact',()=>{
 const p=sparse();p.skills.data=[{id:crypto.randomUUID(),name:'Python',category:'Languages',level:'Coursework only'}];
 let out=n.compileNaturalComposition(p,response(p,[segment('Experienced in Python.',['skill_1'])]),job);
 a.equal(out.candidate.summary.data,'');a(out.summaryRemovals.length);
 p.summary.data='  User-written introduction  ';p.summary.isLocked=true;
 out=n.compileNaturalComposition(p,response(p,[]),job);a.deepEqual(out.candidate.summary,p.summary);
});
test('qualification-only source can support a modest introduction without implying a completed degree or employment',()=>{
 const p=fixture();p.summary.data='';p.experience.data=[];p.projects.data=[];p.certifications.data=[];p.skills.data=[];
 Object.assign(p.education.data[0],{degree:'B.Sc. Information Systems (in progress)',description:'Coursework in reporting.'});
 const packet=n.prepareNaturalComposition(p,job),wire=JSON.parse(d.prepareSingleDraftRequest(packet).wire);
 a.deepEqual(wire.guide.primaryFactIds,[]);a.deepEqual(wire.guide.qualificationFactIds,['education_1']);
 const text='Information systems degree in progress, including reporting coursework.';
 const out=n.compileNaturalComposition(p,response(p,[segment(text,['education_1'])]),job);
 a.equal(out.candidate.summary.data,text);a.deepEqual(out.candidate.education,p.education);a.equal(out.semanticStatus,'unassessed');
});
test('existing summary preservation requires its own citation and does not exempt other new text',()=>{
 const p=fixture();p.experience.data[0].bullets[0].text='Reviewed incident trends for operations teams in weekly reports.';
 p.summary.data=p.experience.data[0].bullets[0].text;
 const out=n.compileNaturalComposition(p,response(p,[segment(p.summary.data,['work_1_b1'])]),job);
 a(out.guardNotes.some(g=>g.path==='summarySegments.0'&&g.message.includes('repeats one experience')));
 a.equal(out.candidate.summary.data,p.summary.data,'ordinary fallback remains intact');
});
