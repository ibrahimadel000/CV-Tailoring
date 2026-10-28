const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {orderedSkillGroups}=load('components/builder/skillPresentation');
const {displaySkillGroups,resumeBlocks}=load('components/builder/resumeModel');
const {createSampleProfile}=load('mock/profile');
const skill=(id,name,category,level='')=>({id,name,category,level});
test('first selected language group stays ahead of tools and concepts',()=>{
 const skills=[skill('a','Python','Languages'),skill('b','REST APIs','Technical'),skill('c','MySQL','Tools'),skill('d','Java','Languages')];
 const before=JSON.stringify(skills),groups=orderedSkillGroups(skills);
 assert.deepEqual(groups.map(g=>g.category),['Languages','Technical','Tools']);
 assert.deepEqual(groups[0].items.map(s=>s.id),['a','d']);
 assert.equal(JSON.stringify(skills),before);assert.equal(groups[0].items[0],skills[0]);
});
test('no backend-specific fixed ordering: interpersonal may lead',()=>{
 assert.deepEqual(orderedSkillGroups([skill('a','Communication','Soft'),skill('b','Python','Languages')]).map(g=>g.title),['Interpersonal','Languages']);
});
test('all category permutations preserve their first occurrence order',()=>{
 function perm(xs){return xs.length?xs.flatMap((x,i)=>perm(xs.filter((_,j)=>j!==i)).map(t=>[x,...t])):[[]];}
 for(const categories of perm(['Technical','Tools','Soft','Languages']))
  assert.deepEqual(orderedSkillGroups(categories.map((c,i)=>skill(''+i,c,c))).map(g=>g.category),categories);
});
test('blank names do not create a group or reorder visible skills',()=>{
 assert.deepEqual(orderedSkillGroups([skill('a','  ','Tools'),skill('b','Python','Languages'),skill('c','SQL client','Tools')]).map(g=>g.category),['Languages','Tools']);
 assert.deepEqual(orderedSkillGroups([]),[]);
});
test('no duplicate removal, renaming, level loss or category inference in presentation',()=>{
 const data=[skill('a','Agile / Scrum','Technical','Basic'),skill('b','Agile/Scrum','Soft','Advanced'),skill('c','C++','Languages'),skill('d','C#','Languages')];
 assert.equal(orderedSkillGroups(data).flatMap(g=>g.items).length,4);
 assert(displaySkillGroups(data)[0].text.includes('Agile / Scrum — Basic'));
 assert(displaySkillGroups(data)[2].text.includes('C++ · C#'));
});
test('native document projection and editor group selector share order and content',()=>{
 const p=createSampleProfile();p.skills.data=[skill('a','Python','Languages'),skill('b','MySQL','Tools'),skill('c','REST APIs','Technical')];
 const editor=orderedSkillGroups(p.skills.data),projected=resumeBlocks(p).find(b=>b.id==='skills');
 assert.deepEqual(projected.items,displaySkillGroups(p.skills.data));
 assert.deepEqual(projected.items.map(x=>x.title),editor.map(x=>x.title));
});
