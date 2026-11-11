// Fictional current-state comparisons; no output quality or omission verdict.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {pairCurrentEntries,hasExactBullet}=load('services/resumeComposer/currentEntryComparison');
const row=(id,title)=>({id,title,bullets:[]});
test('same IDs match even when reordered or renamed, in source order',()=>{
 const source=[row('a','Old title'),row('b','Second')],copy=[row('b','Second'),row('a','New title')],before=JSON.stringify([source,copy]);
 const pairs=pairCurrentEntries(source,copy);a.deepEqual(pairs.map(p=>[p.source?.title,p.copy?.title,p.match]),[['Old title','New title','matched'],['Second','Second','matched']]);
 a.equal(JSON.stringify([source,copy]),before);
});
test('equal titles do not cause different IDs to be matched',()=>{
 const pairs=pairCurrentEntries([row('a','Same')],[row('b','Same')]);
 a.deepEqual(pairs.map(p=>p.match),['source-only','copy-only']);
});
test('missing entries and extra entries remain visible',()=>{
 const pairs=pairCurrentEntries([row('a','A'),row('b','B')],[row('a','A'),row('c','C')]);
 a.deepEqual(pairs.map(p=>[p.source?.id,p.copy?.id,p.match]),[['a','a','matched'],['b',undefined,'source-only'],[undefined,'c','copy-only']]);
 a.deepEqual(pairCurrentEntries([],[]),[]);
});
test('duplicate IDs are never guessed or discarded on either side',()=>{
 const pairs=pairCurrentEntries([row('a','A1'),row('a','A2')],[row('a','A3'),row('b','B')]);
 a.deepEqual(pairs.map(p=>p.match),['ambiguous','ambiguous','ambiguous','copy-only']);
 a.equal(pairs.length,4);a(pairs.every(p=>!(p.source&&p.copy)));
});
test('duplicate copy IDs are never guessed, even with one source entry',()=>{
 const pairs=pairCurrentEntries([row('a','A')],[row('a','A1'),row('a','A2')]);
 a.deepEqual(pairs.map(p=>p.match),['ambiguous','ambiguous','ambiguous']);
});
test('bullet match is literal, entry-local, presence-based and not semantic',()=>{
 const bullets=[{text:'Built reports.'},{text:'Built reports.'}];
 a(hasExactBullet('Built reports.',bullets));a(!hasExactBullet('Developed reports.',bullets));
 a(!hasExactBullet('Built reports',bullets));a(!hasExactBullet('built reports.',bullets));
 a(!hasExactBullet('Built reports.',[]));
});
