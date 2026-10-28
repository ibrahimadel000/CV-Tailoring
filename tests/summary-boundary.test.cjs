// Offline authored checks of a narrow literal boundary, NOT model/semantic QA.
// Node with built-in TypeScript stripping can run this file without dependencies.
// Older supported project environments use the existing TypeScript test loader.
const {test}=require('node:test'),assert=require('node:assert/strict');
const b=process.features.typescript
 ? require('../src/services/resumeComposer/summaryBoundary.ts')
 : require('./helpers/editorial-loader.cjs').load('services/resumeComposer/summaryBoundary');
const facts=[
 {id:'skill_1',kind:'skill',text:'React — Coursework only'},
 {id:'work_1_b1',kind:'achievement',text:'Built internal web applications.'},
 {id:'work_1_b2',kind:'achievement',text:'Built a React interface for internal reports.'},
 {id:'summary',kind:'summary',text:'Interested in creating user-friendly web experiences.'},
];
const skills=[{id:'skill_1',name:'React'}];
const unit=(text,sourceIds)=>({text,sourceIds});
const apply=units=>b.applySummaryBoundary(facts,skills,units);
test('skill-list-only prose is removed, including an invented interest without naming the skill',()=>{
 for(const text of ['Proficient in React.','Interested in web design.','React skills.']){
  const out=apply([unit(text,['skill_1'])]);
  assert.deepEqual(out.retained,[]);assert.equal(out.removals[0].reason,'skill-only-evidence');
 }
});
test('an unrelated narrative citation cannot launder a literal skill claim',()=>{
 for(const refs of [['skill_1','work_1_b1'],['work_1_b1']]){
  const out=apply([unit('Experienced building React applications.',refs)]);
  assert.equal(out.removals[0].reason,'skill-absent-from-narrative');
  assert.deepEqual(out.removals[0].skillIds,['skill_1']);
 }
});
test('actual practice with the named skill is retained verbatim, with or without skill-list references',()=>{
 for(const refs of [['work_1_b2'],['work_1_b2','skill_1']]){
  const input=[unit('Built a React interface for internal reports.',refs)];
  assert.deepEqual(apply(input).retained,input);assert.deepEqual(apply(input).removals,[]);
 }
});
test('explicitly supplied interest is ordinary non-skill evidence, not inferred from the job',()=>{
 const input=[unit('Interested in creating user-friendly web experiences.',['summary'])];
 assert.deepEqual(apply(input).retained,input);
});
test('support elsewhere in the source but not cited does not rescue the skill claim',()=>{
 assert.equal(apply([unit('Built React interfaces.',['work_1_b1'])]).removals.length,1);
});
test('removal is a whole unit, never partial sentence surgery or replacement prose',()=>{
 const input=[unit('Built web applications.',['work_1_b1']),
  unit('Built web applications and mastered React.',['work_1_b1','skill_1']),
  unit('Interested in creating user-friendly web experiences.',['summary'])];
 const before=JSON.stringify(input),out=apply(input);
 assert.deepEqual(out.retained,[input[0],input[2]]);assert.deepEqual(out.retainedIndices,[0,2]);
 assert.deepEqual(out.removals.map(x=>x.segmentIndex),[1]);assert.equal(JSON.stringify(input),before);
 out.retained[0].sourceIds.push('copy-only');assert.equal(JSON.stringify(input),before);
});
test('empty generated summary stays empty, without notices or invented replacement',()=>{
 assert.deepEqual(apply([]),{retained:[],retainedIndices:[],removals:[]});
 assert.equal(b.summaryBoundaryNotice(0,0),'');
});
test('malformed unknown or absent references cannot be treated as safe recoverable wording',()=>{
 assert.throws(()=>apply([unit('Text.',['unknown'])]),/validated source/);
 assert.throws(()=>apply([unit('Text.',[])]),/validated source/);
});
test('literal boundaries handle case, Unicode spacing and symbols without matching embedded tokens',()=>{
 for(const [text,name] of [['REACT interfaces.','React'],['Uses RESTful  APIs.','RESTful APIs'],
  ['Uses Ｒｅａｃｔ.','React'],['Uses C++.','C++'],['Uses C#.','C#'],['Uses .NET.','.NET'],
  ['تطوير الويب.','الويب']])assert(b.containsSkillName(text,name),text);
 for(const [text,name] of [['Reactive systems.','React'],['A reaction.','React'],['Uses C++.','C'],
  ['Uses C#.','C'],['ASP.NET.','.NET'],['Social work.','C'],['React','']])
  assert(!b.containsSkillName(text,name),text+' / '+name);
});
test('native name, not full name-plus-level, is checked',()=>{
 assert.equal(apply([unit('Expert React engineer.',['work_1_b1'])]).removals.length,1);
});
test('all existing skills are checked, even when absent from the selected skill list',()=>{
 const out=b.applySummaryBoundary(facts,[...skills,{id:'skill_2',name:'MySQL'}],
  [unit('Built MySQL applications.',['work_1_b1'])]);
 assert.deepEqual(out.removals[0].skillIds,['skill_2']);
});
test('literal occurrence is NOT entailment: negation and unsupported strength remain unresolved',()=>{
 const source=[{id:'work_1_b1',kind:'achievement',text:'Observed React demonstrations; did not build applications.'}];
 const input=[unit('Led production React development.',['work_1_b1'])];
 assert.deepEqual(b.applySummaryBoundary(source,skills,input).retained,input);
 // This deliberately exposes the limit; it is not a semantic acceptance case.
});
test('aliases and unnamed role/interest claims with narrative citations remain unresolved',()=>{
 for(const text of ['Experienced building React.js applications.','Passionate senior front-end developer.']){
  const labels=text.includes('React.js')?[{id:'skill_1',name:'ReactJS'}]:skills;
  const input=[unit(text,['work_1_b1'])];
  assert.deepEqual(b.applySummaryBoundary(facts,labels,input).retained,input);
 }
});
test('notices describe removal and an empty outcome without claiming factual certification',()=>{
 assert.match(b.summaryBoundaryNotice(1,1),/1 generated summary passage was removed/);
 assert.match(b.summaryBoundaryNotice(2,0),/No generated summary remains/);
 assert.match(b.summaryBoundaryNotice(2,0),/No automatic rewrite or retry/);
});