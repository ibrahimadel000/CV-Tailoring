// Fictional offline regression: provider-visible redactions are not resume prose.
const {test}=require('node:test'), assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
function rig() {
 const p=fixture();
 p.headline.data='Software Engineer';p.resumeHeader.data.desiredJobPosition='Software Engineer';
 p.customSections=[{id:crypto.randomUUID(),title:'VOLUNTEERING',kind:'text',paragraphs:['Mentored students. Materials: https://fictional.invalid/methods. Contact volunteer@fictional.invalid.']}];
 const s=n.prepareNaturalComposition(p,job).source, f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const raw={summarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))})),skillSelections:[]};
 return {p,s,raw};
}
for (const marker of ['[link omitted]','[contact omitted]']) test('withheld-context marker is not published in a generated summary: '+marker,()=>{
 const {p,s,raw}=rig(),before=JSON.stringify(p);
 assert(s.evidence.find(x=>x.id==='context_1').text.includes(marker));
 raw.summarySegments=[{text:`Software Engineer with experience mentoring students ${marker} and improving delivery workflows.`,sourceIds:['headline','context_1','work_1_b2']}];
 const out=n.compileNaturalComposition(p,raw,job);
 assert(!out.candidate.summary.data.includes(marker));
 assert.equal(out.candidate.summary.data,p.summary.data.trim());
 assert(out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.kind==='removed'&&x.message.includes('redaction marker')));
 assert.equal(JSON.stringify(p),before);
});
test('a clean, supported generated introduction remains eligible',()=>{
 const {p,raw}=rig();
 raw.summarySegments=[{text:'Software Engineer with experience building web applications and improving delivery workflows.',sourceIds:['headline','work_1_b1','work_1_b2']}];
 const out=n.compileNaturalComposition(p,raw,job);
 assert.equal(out.candidate.summary.data,raw.summarySegments[0].text);
 assert(!out.guardNotes.some(x=>x.message.includes('redaction marker')));
});
test('a user-authored original summary with literal marker wording remains untouched',()=>{
 const {p,raw}=rig();p.summary.data='Professional summary with literal [link omitted] text.';
 raw.summarySegments=[{text:p.summary.data,sourceIds:['summary']}];
 const out=n.compileNaturalComposition(p,raw,job);assert.equal(out.candidate.summary.data,p.summary.data);
});
test('only the generated marker sentence is removed; independent text can survive',()=>{
 const {p,raw}=rig();
 raw.summarySegments=[
  {text:'Software Engineer mentoring students [LINK OMITTED] and improving delivery workflows.',sourceIds:['headline','context_1','work_1_b2']},
  {text:'Software Engineer with experience building web applications and improving delivery workflows.',sourceIds:['headline','work_1_b1','work_1_b2']},
 ];
 const out=n.compileNaturalComposition(p,raw,job);
 assert.equal(out.candidate.summary.data,raw.summarySegments[1].text);
 assert(out.guardNotes.some(x=>x.path==='summarySegments.0'&&x.message.includes('redaction marker')));
});
test('a generated work line containing a marker is restored',()=>{
 const {p,raw}=rig();raw.entries[0].bullets[0].text='Built web applications [link omitted] and technical architectures.';
 const out=n.compileNaturalComposition(p,raw,job);
 assert.equal(out.candidate.experience.data[0].bullets[0].text,p.experience.data[0].bullets[0].text);
 assert(out.guardNotes.some(x=>x.path==='entries.work_1.bullets.0'&&x.kind==='restored'&&x.message.includes('redaction marker')));
});
test('an unchanged user-authored work line with a literal marker stays intact',()=>{
 const {p}=rig();p.experience.data[0].bullets[0].text='Built web applications [link omitted].';
 const s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x.text]));
 const raw={summarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id),sourceIds:[id]}))})),skillSelections:[]};
 const out=n.compileNaturalComposition(p,raw,job);
 assert.equal(out.candidate.experience.data[0].bullets[0].text,p.experience.data[0].bullets[0].text);
 assert(!out.guardNotes.some(x=>x.path==='entries.work_1.bullets.0'&&x.message.includes('redaction marker')));
});
