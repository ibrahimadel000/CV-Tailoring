// Fictional offline regression tests; these do not validate model quality.
const {test}=require('node:test');
const a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
const d=load('services/resumeComposer/singleDraftRequest');
function setup(){
 const p=fixture();
 p.experience.data[0].bullets[0].text='Reviewed inventory records with warehouse colleagues.';
 p.experience.data[0].bullets[1].text='Prepared training materials for museum guides.';
 p.experience.data[0].bullets[2].text='Sorted fragile exhibits under supervision.';
 p.skills.data=[
  {id:crypto.randomUUID(),name:'Inventory Records',category:'Technical',level:''},
  {id:crypto.randomUUID(),name:'Python',category:'Languages',level:'Coursework only'},
 ];
 return p;
}
test('summary schema removes skill-only IDs when other citation IDs exist without losing skill selection',()=>{
 const p=setup(),packet=n.prepareNaturalComposition(p,job),{wire,responseSchema}=d.prepareSingleDraftRequest(packet),w=JSON.parse(wire);
 a.deepEqual(w.guide.skillListOnlyIds,['skill_2']);
 const ids=responseSchema.properties.summarySegments.items.properties.sourceIds.items.enum;
 a(ids.includes('work_1_b1')); a(ids.includes('skill_1')); a(!ids.includes('skill_2'));
 a.deepEqual(responseSchema.properties.skillSelections.items.properties.id.enum,['skill_1','skill_2']);
 a.equal(w.source.evidence.find(x=>x.id==='skill_2').text,packet.source.evidence.find(x=>x.id==='skill_2').text);
});
test('literal occurrence in unrelated or negated text is only a hint, not proof of experience',()=>{
 const p=setup(); p.experience.data[0].bullets[0].text='Did not use Python in this role.';
 const packet=n.prepareNaturalComposition(p,job),w=JSON.parse(d.prepareSingleDraftRequest(packet).wire);
 a(!w.guide.skillListOnlyIds.includes('skill_2'));
 a.match(d.singleDraftInstructions,/only a literal hint, not proof/);
});
test('summary and entries locks are respected with new guide',()=>{
 const p=setup();p.summary.isLocked=true;p.experience.isLocked=true;
 const q=d.prepareSingleDraftRequest(n.prepareNaturalComposition(p,job));
 a.equal(q.responseSchema.properties.summarySegments.maxItems,0);
 a.deepEqual(JSON.parse(q.wire).guide.entryBulletIds,[]);
});
test('unbacked technology does not silently survive an entry rewrite',()=>{
 const p=setup(),packet=n.prepareNaturalComposition(p,job),s=packet.source;
 const authored={summarySegments:[],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:s.evidence.find(f=>f.id===id).text,sourceIds:[id]}))})),skillSelections:[]};
 authored.entries[0].bullets[0]={text:'Coordinated Python inventory records.',sourceIds:['work_1_b1']};
 const out=n.compileNaturalComposition(p,authored,job);
 a(!out.candidate.experience.data[0].bullets.some(b=>b.text==='Coordinated Python inventory records.'));
 a(out.warnings.length);
});
