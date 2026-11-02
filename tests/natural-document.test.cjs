// Offline authored contract checks. No model calls; negative claims remain unassessed.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {load}=require('./helpers/editorial-loader.cjs');
const n=load('services/resumeComposer/naturalDocument');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
function response(p){
 const s=n.prepareNaturalComposition(p,job).source,map=new Map(s.evidence.map(f=>[f.id,f]));
 return {summarySegments:s.locks.summary?[]:[
  {text:'Software engineer building web applications and technical architectures.',sourceIds:['work_1_b1']},
  {text:'Skills include Python and RESTful APIs.',sourceIds:['skill_1','skill_2']},
 ],entries:[...s.experience.filter(()=>!s.locks.experience),...s.projects.filter(()=>!s.locks.projects)].map(e=>({id:e.id,
  overview:e.overviewId?{text:map.get(e.overviewId).text,sourceIds:[e.overviewId]}:{text:'',sourceIds:[]},
  bullets:e.bulletIds.map(id=>({text:map.get(id).text,sourceIds:[id]}))})),
 skillSelections:s.locks.skills?[]:[{id:'skill_1',category:'Languages'},{id:'skill_2',category:'Technical'},{id:'skill_3',category:'Tools'}]};
}
const compile=(p,r)=>n.compileNaturalComposition(p,r);
const one=(text='Prepared source-linked text.',sourceIds=['work_1_b1'])=>({text,sourceIds});
test('natural packet/schema projects the current output only, no planner or old summary wire',()=>{
 const p=n.prepareNaturalComposition(fixture(),job),g=n.googleNaturalSchema(p);
 assert.equal(p.revision,n.NATURAL_REVISION);
 assert.deepEqual(p.outputContract.required,['summarySegments','entries','skillSelections']);
 assert.deepEqual(g.required,p.outputContract.required);
 assert.equal(g.properties.summarySegments.type,'ARRAY');
 assert.deepEqual(g.properties.summarySegments.items.required,['text','sourceIds']);
 assert.equal(p.outputContract.properties.summarySegments.maxItems,24);
 assert.equal(p.outputContract.properties.summarySegments.items.properties.text.maxLength,2400);
 assert.equal(p.outputContract.properties.entries.maxItems,1);
 assert(!('claimReferencePolicy'in p));assert(!('summaryBlockOrder'in p));assert(!('selectedSkillIds'in p));
 // Google subset intentionally omits positive count/character bounds; compiler enforces them.
 assert(!('maxItems'in g.properties.summarySegments));
 assert(!('maxLength'in g.properties.summarySegments.items.properties.text));
});
test('six independently referenced units compile directly to native summary without five-claim cap',()=>{
 const p=fixture(),r=response(p),before=JSON.stringify(p);
 r.summarySegments=['Built web applications.','Built technical architectures.','Developed web applications.','Developed technical architectures.','Built applications.','Built architectures.'].map(text=>one(text));
 const out=compile(p,r);assert.equal(out.candidate.summary.data,r.summarySegments.map(s=>s.text).join(' '));
 assert.equal(out.summarySegments.length,6);assert(!('summaryClaims'in out));
 assert.deepEqual(out.summaryTrace[0],{segmentIndex:0,sources:[{sourceId:'work_1_b1',kind:'achievement',parent:'work_1'}]});
 assert.equal(out.semanticStatus,'unassessed');assert.equal(JSON.stringify(p),before);
});
test('mixed-kind real practice retains trace kinds without treating skill IDs as semantic proof',()=>{
 const p=fixture();p.experience.data[0].bullets[0].text='Built Python web applications.';
 const r=response(p);r.summarySegments=[one('Built Python web applications.',['work_1_b1','skill_1'])];
 const out=compile(p,r);assert.deepEqual(out.summaryTrace[0].sources.map(s=>s.kind),['achievement','skill']);
 assert.equal(out.candidate.summary.data,r.summarySegments[0].text);assert.equal(out.semanticStatus,'unassessed');
});
test('empty AI summary keeps the original summary without inventing one',()=>{
 const p=fixture(),r=response(p);r.summarySegments=[];const out=compile(p,r);
 // Claim guard: an empty generated summary restores the original; it never wipes it.
 assert.equal(out.candidate.summary.data,p.summary.data.trim());assert.deepEqual(out.summaryTrace,[]);
 assert.deepEqual(out.candidate.education,p.education);assert.deepEqual(out.candidate.certifications,p.certifications);
});
test('all 24 segments fit and native references deduplicate across segments',()=>{
 const p=fixture(),r=response(p);r.summarySegments=Array.from({length:24},()=>one('A.'));
 const out=compile(p,r);assert.equal(out.summarySegments.length,24);assert.deepEqual(out.draft.summary.sourceIds,['work_1_b1']);
 r.summarySegments.push(one());assert.throws(()=>compile(p,r),/summarySegments/);
});
test('2400 joined characters pass; an over-budget sentence is omitted, never truncated',()=>{
 const p=fixture(),r=response(p);r.summarySegments=[one('a'.repeat(1200)),one('b'.repeat(1199))];
 assert.equal(compile(p,r).candidate.summary.data.length,2400);
 // Claim guard: exceeding the joined budget omits the extra sentence with a review note
 // instead of failing the whole document.
 r.summarySegments[1].text+='b';
 const out=compile(p,r);assert.equal(out.candidate.summary.data.length,1200);
 assert(out.guardNotes.some(g=>g.path==='summarySegments.1'&&g.message.includes('length limit')));
 r.summarySegments=[one('a'.repeat(2401))];assert.throws(()=>compile(p,r),/summarySegments/);
});
test('joined reference union follows native 24-reference budget by omission, never truncation',()=>{
 const p=fixture();for(let i=0;i<30;i++)p.skills.data.push({id:crypto.randomUUID(),name:'Capability '+i,category:'Technical',level:''});
 const r=response(p);r.summarySegments=[one('First group.',Array.from({length:24},(_,i)=>'skill_'+(i+1)))];compile(p,r);
 // Claim guard: exceeding the union budget omits the extra sentence with a review note
 // instead of failing the whole document.
 r.summarySegments.push(one('Another group.',['skill_25']));
 const out=compile(p,r);
 assert(out.guardNotes.some(g=>g.path==='summarySegments.1'&&g.message.includes('traceability limit')));
});
for(const [name,segment]of Object.entries({empty:one(''),blank:one('   '),missingRefs:one('Text.',[]),extraKind:{...one(),kind:'experience'},extraField:{...one(),confidence:1}}))test('invalid segment '+name+' fails closed',()=>{
 const p=fixture(),r=response(p),before=JSON.stringify(p);r.summarySegments=[segment];assert.throws(()=>compile(p,r));assert.equal(JSON.stringify(p),before);
});
// Claim guard: interpretable-but-flawed references are removed with a review note;
// the rest of the document survives and the original is never mutated.
for(const [name,segment]of Object.entries({unknown:one('Text.',['UNKNOWN_PRIVATE_MARKER']),duplicate:one('Text.',['skill_1','skill_1']),entity:one('Text.',['work_1'])}))test('flawed segment '+name+' is removed with a note, not a failure',()=>{
 const p=fixture(),r=response(p),before=JSON.stringify(p);
 r.summarySegments=[segment,{text:'Software engineer building web applications.',sourceIds:['work_1_b1']}];
 const out=compile(p,r);assert.equal(JSON.stringify(p),before);
 assert(out.warnings.some(w=>w.path.startsWith('summarySegments.0')),name);
 assert.equal(out.candidate.summary.data,'Software engineer building web applications.');
});
test('unknown source ID removal note does not echo the supplied value',()=>{
 const p=fixture(),r=response(p);r.summarySegments=[one('Text.',['UNKNOWN_PRIVATE_MARKER'])];
 const out=compile(p,r);
 assert(out.guardNotes.some(g=>g.path==='summarySegments.0'));
 assert(!JSON.stringify(out.guardNotes).includes('UNKNOWN_PRIVATE_MARKER'));
 assert(!JSON.stringify(out.warnings).includes('UNKNOWN_PRIVATE_MARKER'));
});
for(const field of ['summaryBlocks','summaryClaims','summary','selectedSkillIds','skillIds','identity','education','customSections','plan','qualityStatus'])test('unmentioned/old top-level '+field+' rejects rather than migrates',()=>{
 const p=fixture(),r=response(p);r[field]={};assert.throws(()=>compile(p,r));
});
test('legacy response without segments does not migrate',()=>{const p=fixture();assert.throws(()=>compile(p,require('./helpers/composer-fixed-v6-fixture.cjs').response(p)));});
for(const section of ['summary','skills','experience','projects'])test('native '+section+' lock restored byte-for-byte and generated content ignored with a note',()=>{
 const p=fixture();if(section==='projects')p.projects.data=[{id:crypto.randomUUID(),name:'Original project',role:'Developer',technologies:[],bullets:[{id:crypto.randomUUID(),text:'Built a personal application.',isVerified:true}]}];
 p[section].isLocked=true;if(section==='summary')p.summary.data='  Exact locked summary  ';
 const r=response(p),out=compile(p,r);assert.deepEqual(out.candidate[section],p[section]);
 const packet=n.prepareNaturalComposition(p,job),schema=n.googleNaturalSchema(packet);
 if(section==='summary'){assert.equal(packet.outputContract.properties.summarySegments.maxItems,0);assert.equal(schema.properties.summarySegments.maxItems,0);r.summarySegments=[one()];}
 else if(section==='skills'){assert.equal(schema.properties.skillSelections.maxItems,0);r.skillSelections=[{id:'skill_1',category:'Languages'}];}
 else r.entries.push({id:section==='projects'?'project_1':'work_1',overview:{text:'',sourceIds:[]},bullets:[one()]});
 // Claim guard: content for a locked section is ignored with a review note; the locked
 // original stays byte-for-byte and the rest of the document survives.
 const again=compile(p,r);assert.deepEqual(again.candidate[section],p[section]);
 assert(again.guardNotes.some(g=>g.kind==='ignored'),section);
});
test('all locked sections and invalid jobs fail preparation before a provider could run',()=>{
 const p=fixture();for(const k of ['summary','skills','experience','projects'])p[k].isLocked=true;
 assert.throws(()=>n.prepareNaturalComposition(p,job));
 for(const j of ['short','x'.repeat(32001)])assert.throws(()=>n.prepareNaturalComposition(fixture(),j));
});
// Claim guard: a flawed entry no longer fails the whole document. The guard restores the
// candidate's original wording or omits the generated line, always with a review note.
for(const [label,[mutate,expect]]of Object.entries({
 missing:[r=>r.entries=[],(out,p)=>{assert.deepEqual(out.candidate.experience.data,p.experience.data);}],
 duplicate:[r=>r.entries.push(structuredClone(r.entries[0])),(out,p)=>{assert.deepEqual(out.candidate.experience.data,p.experience.data);}],
 invented:[r=>r.entries[0].id='work_999',(out,p)=>{assert.deepEqual(out.candidate.experience.data,p.experience.data);}],
 empty:[r=>r.entries[0].bullets=[],(out,p)=>{assert.deepEqual(out.candidate.experience.data,p.experience.data);}],
 skillReference:[r=>r.entries[0].bullets[0].sourceIds=['skill_1'],(out,p)=>{assert.deepEqual(out.candidate.experience.data[0].bullets,p.experience.data[0].bullets);assert(!out.omittedSourceIds.includes('work_1_b1'));}],
 headerReference:[r=>r.entries[0].bullets[0].sourceIds=['entrymeta:work_1:title'],(out,p)=>{assert.deepEqual(out.candidate.experience.data[0].bullets,p.experience.data[0].bullets);assert(!out.omittedSourceIds.includes('work_1_b1'));}],
 inventedOverview:[r=>r.entries[0].overview=one(),(out,p)=>{assert(!out.candidate.experience.data[0].description);}],
 emptyBullet:[r=>r.entries[0].bullets[0]={text:'',sourceIds:[]},(out,p)=>{assert.deepEqual(out.candidate.experience.data[0].bullets,p.experience.data[0].bullets);}],
}))test('native entry guard '+label+' degrades gracefully with a note',()=>{
 const p=fixture(),r=response(p),before=JSON.stringify(p);mutate(r);
 const out=compile(p,r);expect(out,p);assert.equal(JSON.stringify(p),before);
 assert(out.guardNotes.length,label);
});test('cross-employer reference is dropped with a note, while entry headers and native chronology remain unchanged',()=>{
 const p=fixture();p.experience.data.push({...structuredClone(p.experience.data[0]),id:crypto.randomUUID(),companyName:'Second employer'});
 const r=response(p),valid=compile(p,r);assert.deepEqual(valid.candidate.experience.data.map(e=>e.companyName),p.experience.data.map(e=>e.companyName));
 // An unmatchable foreign reference restores the complete original entry with a review note.
 r.entries[0].bullets[0].sourceIds=['work_2_b1'];
 const out=compile(p,r);
 assert(out.guardNotes.some(g=>g.path==='entries.work_1.bullets.0'));
 assert.deepEqual(out.candidate.experience.data[0].bullets,p.experience.data[0].bullets);
 assert.deepEqual(out.candidate.experience.data.map(e=>e.companyName),p.experience.data.map(e=>e.companyName));
});
test('unchanged bullets keep native IDs/verification; omission is derived, not forced rewriting',()=>{
 const p=fixture(),r=response(p);r.entries[0].bullets=r.entries[0].bullets.slice(0,1);
 const out=compile(p,r);assert.deepEqual(out.candidate.experience.data[0].bullets[0],p.experience.data[0].bullets[0]);
 assert(out.omittedSourceIds.includes('work_1_b2'));assert(out.omittedSourceIds.includes('work_1_b3'));
});
test('existing overview restored when a generated overview cites foreign or identity-only references',()=>{
 const p=fixture();p.experience.data[0].description='Built internal web systems.';
 const r=response(p);compile(p,r);
 // Claim guard: bad overview references restore the original overview with a review note
 // instead of failing the whole document.
 r.entries[0].overview.sourceIds=['skill_1'];
 let out=compile(p,r);assert.equal(out.candidate.experience.data[0].description,'Built internal web systems.');
 assert(out.guardNotes.some(g=>g.path==='entries.work_1.overview'));
 r.entries[0].overview={text:'Header as work.',sourceIds:['entrymeta:work_1:title']};
 out=compile(p,r);assert.equal(out.candidate.experience.data[0].description,'Built internal web systems.');
 assert(out.guardNotes.some(g=>g.path==='entries.work_1.overview'));
});
test('empty original entry may remain empty',()=>{
 const p=fixture();p.experience.data[0].bullets=[];p.experience.data[0].description='';
 const r=response(p);r.summarySegments=[one('Skills include Python.',['skill_1'])];compile(p,r);
});
test('skill selections bind native names/levels and explicit category/order, not inferred practice',()=>{
 const p=fixture(),r=response(p);p.skills.data[0].level='Course only';
 r.skillSelections=[{id:'skill_3',category:'Tools'},{id:'skill_1',category:'Languages'},{id:'skill_2',category:'Technical'}];
 const out=compile(p,r);assert.deepEqual(out.candidate.skills.data.map(s=>[s.id,s.name,s.level,s.category]),r.skillSelections.map(s=>{
 const v=p.skills.data[Number(s.id.slice(6))-1];return[v.id,v.name,v.level,s.category];}));
 assert.deepEqual(out.draft.skillOrder,['skill_3','skill_1','skill_2']);
});
test('interleaved selected categories keep native binder order; category group order follows first occurrence',()=>{
 const p=fixture(),r=response(p);r.skillSelections=[{id:'skill_3',category:'Tools'},{id:'skill_4',category:'Technical'},{id:'skill_1',category:'Languages'},{id:'skill_2',category:'Technical'}];
 const out=compile(p,r);assert.deepEqual([...new Set(out.candidate.skills.data.map(s=>s.category))],['Tools','Technical','Languages']);
 assert.deepEqual(out.candidate.skills.data.filter(s=>s.category==='Technical').map(s=>s.name),['Agile/Scrum','RESTful APIs']);
});
test('equivalent duplicates across categories collapse to first chosen native record with visible note',()=>{
 const p=fixture(),r=response(p);r.skillSelections=[{id:'skill_5',category:'Soft'},{id:'skill_4',category:'Technical'}];
 const out=compile(p,r);assert.deepEqual(out.candidate.skills.data,[{...p.skills.data[4],category:'Soft'}]);
 assert.equal(out.normalizations[0].retainedId,'skill_5');assert.equal(out.normalizations[0].omittedId,'skill_4');
 assert.equal(out.draft.omittedSkills.find(s=>s.sourceId==='skill_4').reason,out.normalizations[0].reason);
});
test('different levels do not collapse',()=>{
 const p=fixture(),r=response(p);p.skills.data[4].level='Course only';r.skillSelections=[{id:'skill_4',category:'Technical'},{id:'skill_5',category:'Technical'}];
 assert.equal(compile(p,r).candidate.skills.data.length,2);
});
for(const [label,item]of Object.entries({category:{id:'skill_4',category:'Interpersonal'},renamed:{id:'skill_4',category:'Technical',name:'Expert'}}))test('invalid skill '+label+' rejects before normalization',()=>{
 const p=fixture(),r=response(p);r.skillSelections.push(item);assert.throws(()=>compile(p,r));
});
// Claim guard: repeated or unknown skill IDs are ignored with a review note while the
// valid selections still apply, instead of failing the whole document.
for(const [label,item]of Object.entries({repeated:{id:'skill_1',category:'Languages'},unknown:{id:'skill_999',category:'Tools'}}))test('invalid skill '+label+' ignored with a note; valid selections still apply',()=>{
 const p=fixture(),r=response(p);r.skillSelections.push(item);
 const out=compile(p,r);assert(out.guardNotes.some(g=>g.path==='skillSelections'&&g.kind==='ignored'));
 assert.deepEqual(out.draft.skillOrder,['skill_1','skill_2','skill_3']);
});
test('unmentioned native content and contact stay out of packet, unchanged in candidate',()=>{
 const p=fixture();p.resumeHeader.data.email='PRIVATE_CONTACT_SENTINEL@example.test';
 p.customSections=[{id:crypto.randomUUID(),title:'Private notes',kind:'text',paragraphs:['PRIVATE_NOTE_SENTINEL']}];
 const packet=n.prepareNaturalComposition(p,job),s=JSON.stringify(packet);assert(!s.includes('PRIVATE_CONTACT_SENTINEL'));assert(!s.includes('PRIVATE_NOTE_SENTINEL'));
 const out=compile(p,response(p));for(const k of ['resumeHeader','headline','education','certifications','languages','customSections','documentTheme'])assert.deepEqual(out.candidate[k],p[k]);
});
for(const field of ['revision','referencePolicy','documentBrief','outputContract'])test('tampered packet '+field+' cannot project',()=>{
 const p=n.prepareNaturalComposition(fixture(),job);p[field]={};assert.throws(()=>n.googleNaturalSchema(p),/mismatch/);
});
test('tampered source kinds, relationships and extra packet fields cannot bypass projection',()=>{
 for(const mutate of [p=>p.source.evidence.find(f=>f.id==='skill_1').kind='achievement',p=>p.source.evidence.find(f=>f.id==='work_1_b1').parent='work_999',p=>p.job='short',p=>p.hiddenPlanner={}]){
 const p=n.prepareNaturalComposition(fixture(),job);mutate(p);assert.throws(()=>n.googleNaturalSchema(p));}
});
for(const text of ['Owned production automated testing strategy.','Built REST APIs with MySQL at Example Systems.','Improved application runtime by streamlining delivery workflows.','Expert Python engineer.','Completed the computer science degree.'])test('literal-skill subset removed; other unsupported examples remain unassessed: '+text,()=>{
 const p=fixture(),r=response(p);r.summarySegments=[one(text,['work_1_b1','skill_1'])];
 const out=compile(p,r),removed=text.includes('MySQL')||text.includes('Python');
 // Claim guard: when every generated sentence is removed, the original summary is kept
 // with a review note instead of saving an empty one.
 assert.equal(out.candidate.summary.data,removed?p.summary.data.trim():text);assert.equal(out.summaryRemovals.length,removed?1:0);
 assert.equal(out.semanticStatus,'unassessed');
 assert(!('qualityStatus'in out));assert(!('semanticVerified'in out));assert(!('score'in out));
});
test('standalone instructions have no old wire, word bans, planner or mandatory topic inventory',()=>{
 for(const forbidden of ['summaryBlocks','summaryClaims','selectedSkillIds','summaryBlockOrder','ACTIVE OUTPUT CONTRACT IS v4','ACTIVE OUTPUT CONTRACT IS v6'])assert(!n.naturalInstructions.includes(forbidden));
 for(const phrase of ['one response','do not attach','do not enumerate every relevant bullet','A useful original bullet may stay unchanged','not semantic verification','No edits to identity']){
 if(phrase==='do not attach')assert(n.naturalInstructions.includes('does not establish performed work at an employer'));else assert(n.naturalInstructions.includes(phrase),phrase);
 }
 const code=fs.readFileSync(path.join(__dirname,'../src/services/resumeComposer/naturalDocument.ts'),'utf8');
 assert(code.includes('compileComposition(profile'));assert(!code.includes('compileEditorialComposition'));assert(!code.includes('compileFixedComposition'));
 assert(!code.includes('fetch('));assert(!code.includes('process.env'));assert(!code.includes('phasePlanner'));
});
test('original qualified skill contexts are retained rather than flattened into display equivalence',()=>{
 const p=fixture();p.skills.data[4].name='Agile/Scrum';
 p.importedFrom={fileName:'authored-fixture.pdf',format:'pdf',importedAt:'2026-10-24',warnings:[],sourceText:'Technical Skills\nMethods: Agile/Scrum\nCoursework only: Agile/Scrum\n'};
 const packet=n.prepareNaturalComposition(p,job);assert(packet.source.originalSkillContexts.length);
 const r=response(p);r.skillSelections=[{id:'skill_4',category:'Technical'},{id:'skill_5',category:'Technical'}];
 // Both literal names occur in both groups: no fabricated per-record distinction.
 assert.equal(compile(p,r).candidate.skills.data.length,1);
 p.skills.data[4].name='Agile / Scrum';
 // Exact-name recovery cannot distinguish identical normalized names here; full text/level guard still applies.
 p.skills.data[4].level='Introductory coursework only';
 const out=compile(p,response(p));assert.equal(out.semanticStatus,'unassessed');
});
test('per-passage and selection capacities match existing native schema without truncation',()=>{
 const p=fixture(),r=response(p);r.entries[0].bullets=Array.from({length:40},()=>one('Supported text.'));compile(p,r);
 r.entries[0].bullets.push(one('Another.'));assert.throws(()=>compile(p,r),/entries/);
 const s=response(p);s.skillSelections=Array.from({length:201},()=>({id:'skill_1',category:'Languages'}));assert.throws(()=>compile(p,s),/skillSelections/);
 const t=response(p);t.entries[0].bullets[0].text='b'.repeat(2401);assert.throws(()=>compile(p,t),/entries/);
});

test('redaction placeholders are described as metadata, not output facts; instruction-only boundary',()=>{
 for(const text of ['[link omitted]','[contact omitted]','not candidate facts or final resume wording','Do not copy them into output or infer the withheld content'])assert(n.naturalInstructions.includes(text));
 // Instruction assertion only; no claim that the compiler enforces sentence meaning.
});
