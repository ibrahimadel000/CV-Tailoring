// Synthetic offline diagnostics: literal wording differences, not quality or factual truth.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs'),{fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument'),{summarizeProposal}=load('services/resumeComposer/changeSummary');
function setup(){const p=fixture(),s=n.prepareNaturalComposition(p,job).source;const map=new Map(s.evidence.map(f=>[f.id,f.text]));return {p,s,map};}
test('proposal counts unchanged reordered and edited wording, not semantic quality',()=>{
 const {s,map}=setup(), id=s.experience[0].id,ids=s.experience[0].bulletIds;
 const entries=[{id,overview:{text:'',sourceIds:[]},bullets:[{text:map.get(ids[1]),sourceIds:[ids[1]]},{text:'Developed web applications and technical architectures.',sourceIds:[ids[0]]},{text:map.get(ids[2]),sourceIds:[ids[2]]}]}];
 a.deepEqual(summarizeProposal(s,{entries}),{proposed:3,different:1});
});
test('no narrative or locked entries and invalid or repeated entries do not inflate counts',()=>{
 const {s,map}=setup(),id=s.experience[0].id,ids=s.experience[0].bulletIds;
 const e={id,overview:{text:'',sourceIds:[]},bullets:[{text:map.get(ids[0]),sourceIds:[ids[0]]}]};
 a.deepEqual(summarizeProposal(s,{entries:[e,e,{...e,id:'unknown'}]}),{proposed:1,different:0});
 s.locks.experience=true;a.deepEqual(summarizeProposal(s,{entries:[e]}),{proposed:0,different:0});
});
test('only numbers persist and no provider raw text is saved',async()=>{
 const {p,s,map}=setup(),id=s.experience[0].id,ids=s.experience[0].bulletIds,before=JSON.stringify(p);let active=p,copy;
 const raw={summarySegments:[],alternativeSummarySegments:[],skillSelections:[],entries:[{id,overview:{text:'',sourceIds:[]},bullets:[{text:'Built applications using Kubernetes.',sourceIds:[ids[0]]},{text:map.get(ids[1]),sourceIds:[ids[1]]},{text:map.get(ids[2]),sourceIds:[ids[2]]}]}]};
 const {createCompositionRunner}=load('services/resumeComposer/workflow');
 const runner=createCompositionRunner({readActive:()=>active,appendIfCurrent(snapshot,c){a.equal(snapshot,before);active=copy=c;return true;}},async()=>raw);
 const out=await runner.run(job,new AbortController().signal);
 a.deepEqual(out.proposalComparison,{proposed:3,different:1});
 if(out.status==='created'){a.deepEqual(copy.compositionChanges.proposal,{proposed:3,different:1});a(!JSON.stringify(copy).includes('Built applications using Kubernetes.'));}
 a.equal(JSON.stringify(p),before);
});
test('unchanged output exposes counts for the current session without creating a copy',async()=>{
 const {p,s,map}=setup();p.summary.isLocked=true;p.skills.isLocked=true;let saved=0,calls=0;
 const raw={summarySegments:[],alternativeSummarySegments:[],skillSelections:[],entries:[{id:s.experience[0].id,overview:{text:'',sourceIds:[]},bullets:s.experience[0].bulletIds.map(id=>({text:map.get(id),sourceIds:[id]}))}]};
 const {createCompositionRunner}=load('services/resumeComposer/workflow');const runner=createCompositionRunner({readActive:()=>p,appendIfCurrent(){saved++;return true;}},async()=>{calls++;return raw;});
 const out=await runner.run(job,new AbortController().signal);a.equal(out.status,'unchanged');a.deepEqual(out.proposalComparison,{proposed:3,different:0});a.equal(saved,0);a.equal(calls,1);
});
