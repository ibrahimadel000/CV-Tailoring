// Claim guard + literal term checks: offline authored fixtures only, no provider calls.
// The guard may restore original wording or omit generated text, but NEVER writes prose.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {buildTermIndex,unsupportedTerms,unsupportedNumbers}=load('services/resumeComposer/terms');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');

function response(p,summarySegments){
 const s=n.prepareNaturalComposition(p,job).source,f=new Map(s.evidence.map(x=>[x.id,x]));
 return {summarySegments:summarySegments??[{text:'Software engineer combining web application development with delivery workflow improvement and technical onboarding.',sourceIds:['work_1_b1','work_1_b2','work_1_b3']}],
 entries:s.experience.filter(()=>!s.locks.experience).map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:f.get(id).text,sourceIds:[id]}))})),
 skillSelections:s.locks.skills?[]:[{id:'skill_1',category:'Languages'},{id:'skill_2',category:'Technical'},{id:'skill_3',category:'Tools'}]};
}

// --- terms.ts: literal coverage, never semantic certification ---
test('salient terms must literally appear in the cited support',()=>{
 const index=buildTermIndex(['Python','MySQL']);
 const support=['Built web applications and technical architectures.'];
 a.deepEqual(unsupportedTerms('Developed web applications and modern technical architectures.',support,index),[]);
 a.deepEqual(unsupportedTerms('Built cloud-native web applications using Kubernetes.',support,index).map(t=>t.label),['Kubernetes']);
 a.deepEqual(unsupportedTerms('Used MySQL daily.',support,index).map(t=>t.label),['MySQL']);
 a.deepEqual(unsupportedTerms('Used MySQL daily.',['Worked with MySQL databases.'],index),[]);
 a.deepEqual(unsupportedTerms('Maintained REST APIs.',['Maintained the REST API layer.'],index),[],'plural tolerant');
 a.deepEqual(unsupportedTerms('Built Node.js services.',support,index).map(t=>t.label),['Node.js']);
 a.deepEqual(unsupportedTerms('The work used CI/CD pipelines.',support,index).map(t=>t.label),['CI/CD']);
 a.deepEqual(unsupportedTerms('Worked at Example Systems.',support,index).map(t=>t.label),['Example Systems']);
});
test('numbers must literally appear in the cited support',()=>{
 const support=['Reduced deployment time by 85% across 6 teams.'];
 a.deepEqual(unsupportedNumbers('Reduced deployment time by 85%.',support),[]);
 a.deepEqual(unsupportedNumbers('Reduced deployment time by 40%.',support),['40']);
 a.deepEqual(unsupportedNumbers('Processed 50,000 events.',['Processed 50000 events.']),[]);
 a.deepEqual(unsupportedNumbers('No figures here.',support),[]);
});

// --- claim guard through the real compiler ---
test('a fully supported rewritten document passes unchanged with zero guard notes',()=>{
 const p=fixture(),before=JSON.stringify(p),r=response(p);
 r.entries[0].bullets=[
  {text:'Developed web applications and technical architectures aligned with daily business operations.',sourceIds:['work_1_b1']},
  {text:'Improved delivery workflows and reduced technical overhead across the team.',sourceIds:['work_1_b2']},
  {text:r.entries[0].bullets[2].text,sourceIds:['work_1_b3']},
 ];
 const out=n.compileNaturalComposition(p,r);
 a.deepEqual(out.guardNotes,[]);a.deepEqual(out.summaryRemovals,[]);
 a.equal(out.candidate.summary.data,r.summarySegments[0].text);
 a.equal(out.candidate.experience.data[0].bullets[0].text,r.entries[0].bullets[0].text);
 a.equal(out.candidate.experience.data[0].bullets[0].isVerified,false,'rewritten bullets are new records');
 a.equal(out.candidate.experience.data[0].bullets[2].text,p.experience.data[0].bullets[2].text);
 a.equal(JSON.stringify(p),before);a.equal(out.semanticStatus,'unassessed');
});
test('a rewrite adding an unlisted technology restores the original bullet with a note',()=>{
 const p=fixture(),r=response(p);
 r.entries[0].bullets[0]={text:'Built cloud-native web applications using Kubernetes.',sourceIds:['work_1_b1']};
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.experience.data[0].bullets[0].text,p.experience.data[0].bullets[0].text);
 a.equal(out.candidate.experience.data[0].bullets[0].id,p.experience.data[0].bullets[0].id,'restored bullet keeps its native ID');
 const note=out.guardNotes.find(g=>g.path==='entries.work_1.bullets[0]'||g.path==='entries.work_1.bullets.0');
 a(note&&note.kind==='restored');a(note.message.includes('Kubernetes'));a(note.message.includes('does not mention'));
});
test('a rewrite adding an unstated metric restores the original bullet with a note',()=>{
 const p=fixture(),r=response(p);
 r.entries[0].bullets[1]={text:'Improved delivery workflows, cutting technical overhead by 40%.',sourceIds:['work_1_b2']};
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.experience.data[0].bullets[1].text,p.experience.data[0].bullets[1].text);
 const note=out.guardNotes.find(g=>g.path==='entries.work_1.bullets.1');
 a(note&&note.message.includes('40'));
});
test('a rewrite preserving a stated figure stays accepted',()=>{
 const p=fixture();p.experience.data[0].bullets[1].text='Improved delivery workflows across 3 teams and reduced technical overhead.';
 const r=response(p);
 r.entries[0].bullets[1]={text:'Improved delivery workflows across 3 teams, reducing technical overhead.',sourceIds:['work_1_b2']};
 const out=n.compileNaturalComposition(p,r);
 a.deepEqual(out.guardNotes,[]);
 a.equal(out.candidate.experience.data[0].bullets[1].text,r.entries[0].bullets[1].text);
});
test('an entry the AI skipped is restored to its original wording with a note',()=>{
 const p=fixture();p.experience.data.push({...structuredClone(p.experience.data[0]),id:crypto.randomUUID(),companyName:'Second employer',roleTitle:'Engineer'});
 const r=response(p);r.entries=r.entries.slice(0,1);
 const out=n.compileNaturalComposition(p,r);
 a(out.guardNotes.some(g=>g.path==='entries.work_2'&&g.kind==='restored'));
 a.equal(out.candidate.experience.data.length,2);
 a.deepEqual(out.candidate.experience.data[1].bullets.map(b=>b.text),p.experience.data[1].bullets.map(b=>b.text));
});
test('a bullet mixing another entry’s reference is removed or restored, never kept',()=>{
 const p=fixture();p.experience.data.push({...structuredClone(p.experience.data[0]),id:crypto.randomUUID(),companyName:'Second employer'});
 const r=response(p);r.entries[0].bullets[0].sourceIds=['work_2_b2'];
 const out=n.compileNaturalComposition(p,r);
 a(out.guardNotes.some(g=>g.path==='entries.work_1.bullets.0'));
 a.deepEqual(out.candidate.experience.data[0].bullets,p.experience.data[0].bullets,'unmatchable line restores the complete original entry');
});
test('every candidate passage is either authored-and-supported or the original wording',()=>{
 const p=fixture();
 const originals=new Set([p.summary.data.trim(),...p.experience.data.flatMap(e=>[e.description,...e.bullets.map(b=>b.text)])].filter(Boolean).map(s=>s.trim()));
 for(const mutate of [
  r=>{r.entries[0].bullets[0]={text:'Built event-driven systems with Kafka.',sourceIds:['work_1_b1']};},
  r=>{r.entries[0].bullets[1]={text:'Improved workflows by 99%.',sourceIds:['work_1_b2']};},
  r=>{r.entries=[];},
  r=>{r.entries[0].bullets[0].sourceIds=['skill_2'];},
  r=>{r.summarySegments=[{text:'Certified Kubernetes administrator.',sourceIds:['skill_999']}];},
 ]){
  const r=response(p);mutate(r);const out=n.compileNaturalComposition(p,r);
  const aiTexts=new Set(r.entries.flatMap(e=>[e.overview,...e.bullets]).map(b=>b.text.trim()));
  for(const e of out.candidate.experience.data)for(const t of [e.description,...e.bullets.map(b=>b.text)]){
   if(!t)continue;
   a(originals.has(t.trim())||aiTexts.has(t.trim()),'passage is neither original nor authored: '+t);
  }
 }
});
test('guard notes reach the user-facing warnings list with their paths',()=>{
 const p=fixture(),r=response(p);r.entries=[];
 const out=n.compileNaturalComposition(p,r);
 a(out.guardNotes.some(g=>g.path==='entries.work_1'));
 a(out.warnings.some(w=>w.path==='entries.work_1'&&w.message.includes('skipped this entry')));
 a(out.warnings.every(w=>typeof w.message==='string'&&w.message.length>10));
});
test('malformed responses still fail closed and save nothing',()=>{
 const p=fixture(),before=JSON.stringify(p);
 for(const raw of [null,{}, {summarySegments:[],entries:[],skillSelections:[],extra:1},
  {...response(p),summarySegments:[{text:'x'.repeat(2401),sourceIds:['work_1_b1']}]},
  {...response(p),entries:[{id:'work_1',overview:{text:'',sourceIds:[]},bullets:Array.from({length:41},()=>({text:'b',sourceIds:['work_1_b1']}))}]},
 ]) a.throws(()=>n.compileNaturalComposition(p,raw),e=>e instanceof Error&&/malformed|unchanged|summarySegments|entries/.test(e.message));
 a.equal(JSON.stringify(p),before);
});

test('an achievement with a mixed identity reference restores narrative instead of stripping the identity silently',()=>{
 const p=fixture(),r=response(p),original=p.experience.data[0].bullets[0].text;
 r.entries[0].bullets[0]={text:'Built enterprise web applications.',sourceIds:['work_1_b1','entrymeta:work_1:title']};
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.experience.data[0].bullets[0].text,original);
 a(out.guardNotes.some(n=>n.path==='entries.work_1.bullets.0'&&n.message.includes('identity reference')));
});
test('an existing overview may retain valid same-entry identity plus narrative references',()=>{
 const p=fixture();p.experience.data[0].description='Built web applications for daily operations.';
 const r=response(p);r.entries[0].overview={text:p.experience.data[0].description,sourceIds:['work_1_overview','entrymeta:work_1:title']};
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.experience.data[0].description,p.experience.data[0].description);
 a.deepEqual(out.draft.experience[0].overview.sourceIds,['work_1_overview','entrymeta:work_1:title']);
 a(!out.guardNotes.some(n=>n.path==='entries.work_1.overview'));
});

test('supported reordered technical wording is retained and flagged for relationship review',()=>{
 const p=fixture(); p.experience.data[0].bullets[0].text='Built APIs using Python.';
 const r=response(p);r.entries[0].bullets[0]={text:'Built Python APIs.',sourceIds:['work_1_b1']};
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.experience.data[0].bullets[0].text,'Built Python APIs.');
 a(out.guardNotes.some(n=>n.kind==='review'&&n.path==='entries.work_1.bullets.0'&&n.message.includes('does not verify the claim or its scope')));
 a(out.warnings.some(n=>n.path==='entries.work_1.bullets.0'&&n.message.includes('does not verify the claim or its scope')));
 a.equal(out.semanticStatus,'unassessed');
});
test('separately present words do not falsely certify an invented relationship',()=>{
 const p=fixture();p.experience.data[0].bullets[0].text='Used Python for data analysis. Maintained PHP APIs.';
 const r=response(p);r.entries[0].bullets[0]={text:'Built Python APIs.',sourceIds:['work_1_b1']};
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.experience.data[0].bullets[0].text,p.experience.data[0].bullets[0].text);
 a(out.guardNotes.some(n=>n.kind==='restored'));
 a.equal(out.semanticStatus,'unassessed'); // Human review remains essential; no automated truth verdict.
});

test('the reversal exception cannot delete a source negation or change the action',()=>{
 for(const source of ['Did not build APIs using Python.','Learned about APIs using Python.']){
  const p=fixture();p.experience.data[0].bullets[0].text=source;const r=response(p);
  r.entries[0].bullets[0]={text:'Built Python APIs.',sourceIds:['work_1_b1']};
  const out=n.compileNaturalComposition(p,r);
  a.equal(out.candidate.experience.data[0].bullets[0].text,source);
  a(out.guardNotes.some(note=>note.kind==='restored'));
 }
});

test('summary removes unsupported numeric and technical additions while keeping supported adjacent text',()=>{
 const p=fixture(),before=JSON.stringify(p),r=response(p);
 r.summarySegments=[
  {text:'Built web applications and technical architectures.',sourceIds:['work_1_b1']},
  {text:'Built web applications using Kubernetes for 500 clients.',sourceIds:['work_1_b1']},
 ];
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.summary.data,r.summarySegments[0].text);
 a(out.guardNotes.some(g=>g.path==='summarySegments.1'&&g.kind==='removed'&&g.message.includes('Kubernetes')&&g.message.includes('500')));
 a.equal(JSON.stringify(p),before);
});
test('summary restores original when its only generated passage adds unsupported numbers',()=>{
 const p=fixture(),r=response(p);r.summarySegments=[{text:'Built web applications for 500 clients.',sourceIds:['work_1_b1']}];
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.summary.data,p.summary.data.trim());
 a(out.warnings.some(w=>w.path==='summarySegments.0'&&w.message.includes('500')));
});

test('summary keeps a literally supported figure and original source wording',()=>{
 const p=fixture();p.experience.data[0].bullets[0].text='Built applications used by 30 staff.';
 const r=response(p);r.summarySegments=[{text:'Built applications used by 30 staff.',sourceIds:['work_1_b1']}];
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.summary.data,r.summarySegments[0].text);a.deepEqual(out.guardNotes,[]);
 a.equal(out.semanticStatus,'unassessed');
});
test('summary permits narrowly reordered wording with an explicit review note',()=>{
 const p=fixture();p.experience.data[0].bullets[0].text='Built APIs using Python.';
 const r=response(p);r.summarySegments=[{text:'Built Python APIs.',sourceIds:['work_1_b1']}];
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.summary.data,r.summarySegments[0].text);
 a(out.guardNotes.some(g=>g.path==='summarySegments.0'&&g.kind==='review'&&g.message.includes('does not verify')));
});
test('supported literal figures do not certify the relationship or meaning',()=>{
 const p=fixture();p.experience.data[0].bullets[0].text='Built applications for 30 internal staff.';
 const r=response(p);r.summarySegments=[{text:'Built applications for 30 external clients.',sourceIds:['work_1_b1']}];
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.summary.data,r.summarySegments[0].text);
 a.equal(out.semanticStatus,'unassessed'); // Literal coverage is not factual verification.
});

test('summary removal and trace indices refer to original response after earlier guard removal',()=>{
 const p=fixture(),r=response(p);
 r.summarySegments=[
  {text:'Built applications for 500 clients.',sourceIds:['work_1_b1']},
  {text:'Built applications with Python.',sourceIds:['work_1_b1','skill_1']},
  {text:'Built web applications and technical architectures.',sourceIds:['work_1_b1']},
 ];
 const out=n.compileNaturalComposition(p,r);
 a.equal(out.candidate.summary.data,r.summarySegments[2].text);
 a(out.guardNotes.some(g=>g.path==='summarySegments.0'));
 a.equal(out.summaryRemovals[0].segmentIndex,1);
 a(out.warnings.some(w=>w.path==='summarySegments.1'));
 a.equal(out.summaryTrace[0].segmentIndex,2);
});
