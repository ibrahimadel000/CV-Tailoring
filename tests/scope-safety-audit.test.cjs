// Synthetic risk probes. These guards are literal signals, not factual verification.
const {test}=require('node:test'), assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-editorial-v4-fixture.cjs');
const n=load('services/resumeComposer/naturalDocument');
function compose(sourceText, proposed){
 const p=fixture();p.experience.data[0].bullets[0].text=sourceText;
 const source=n.prepareNaturalComposition(p,job).source,facts=new Map(source.evidence.map(x=>[x.id,x]));
 const wire={summarySegments:[],alternativeSummarySegments:[],entries:source.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map((id,i)=>({text:i?facts.get(id).text:proposed,sourceIds:[id]}))})),skillSelections:[]};
 const before=JSON.stringify(p),out=n.compileNaturalComposition(p,wire,job);
 assert.equal(JSON.stringify(p),before);return {out,actual:out.candidate.experience.data[0].bullets[0].text};
}
for(const [label,source,proposal] of [
 ['unsubstantiated leadership','Built web applications and technical architectures.','Led the team building web applications and technical architectures.'],
 ['explicit negative reversed','Assisted with web application testing in a classroom; did not deploy production systems.','Deployed web applications to production.'],
 ['invented external audience','Built web applications and technical architectures.','Built web applications used by external customers.'],
 ['unsubstantiated production setting','Developed a prototype web application in a classroom.','Developed a production web application.'],
 ['non-production limitation reversed','Tested applications in a non-production environment.','Tested applications in a production environment.'],
 ['invented negative','Built web applications and technical architectures.','Did not build web applications.'],
]) test(label+' restores the source with a review reason',()=>{const {out,actual}=compose(source,proposal);assert.equal(actual,source);assert(out.guardNotes.some(n=>n.path==='entries.work_1.bullets.0'&&n.kind==='restored'));});
for(const [label,source,proposal] of [
 ['ordinary paraphrase','Built web applications and technical architectures.','Developed web applications and technical architectures.'],
 ['actual team leadership','Led a team of developers building web applications.','Led the team of developers building web applications.'],
 ['actual external audience','Built web applications used by external customers.','Developed web applications used by external customers.'],
 ['actual production','Developed production web applications.','Built production web applications.'],
 ['preserved limitation','Tested web applications but did not deploy production systems.','Tested applications but did not deploy production systems.'],
 ['not only idiom','Not only built web applications but also wrote documentation.','Built web applications and wrote documentation.'],
]) test(label+' retains the supported rewrite',()=>{const {actual}=compose(source,proposal);assert.equal(actual,proposal);});
// Explicit participation and setting qualifiers: limited literal checks only.
for(const [label,source,proposal] of [
 ['assistance removed','Assisted developers with testing web applications.','Tested web applications.'],
 ['classroom removed','Developed web applications in a classroom exercise.','Developed web applications for the company.'],
 ['prototype removed','Built a prototype web application.','Built a web application.'],
 ['coursework removed','Practiced designing databases as coursework.','Designed databases.'],
]) test(label+' restores original wording and notes the potential loss',()=>{const {out,actual}=compose(source,proposal);assert.equal(actual,source);assert(out.guardNotes.some(n=>n.path==='entries.work_1.bullets.0'&&n.kind==='restored'));});
for(const [label,source,proposal] of [
 ['assistance retained','Assisted developers with testing web applications.','Supported developers in testing web applications.'],
 ['classroom retained','Developed web applications in a classroom exercise.','Built web applications in a classroom exercise.'],
 ['prototype retained','Built a prototype web application.','Developed a prototype web application.'],
 ['coursework retained','Practiced designing databases as coursework.','Practiced database design as coursework.'],
]) test(label+' permits the qualified wording',()=>{const {actual}=compose(source,proposal);assert.equal(actual,proposal);});
test('explicit independence conflicting with supervision restores the original',()=>{
 const source='Assisted developers with testing web applications under supervision.';
 const {out,actual}=compose(source,'Assisted developers with testing web applications independently.');
 assert.equal(actual,source);
 assert(out.guardNotes.some(n=>n.path==='entries.work_1.bullets.0'&&n.message.includes('supervision wording')));
});
test('supervised and independently-supported rewrites remain possible',()=>{
 let {actual}=compose('Assisted developers with testing web applications under supervision.','Supported developers in testing web applications under supervision.');
 assert.equal(actual,'Supported developers in testing web applications under supervision.');
 ({actual}=compose('Assisted developers with testing web applications independently.','Supported developers in testing web applications independently.'));
 assert.equal(actual,'Supported developers in testing web applications independently.');
});
test('loss of explicit supervision restores the original and explains why',()=>{
 const source='Assisted developers with testing web applications under supervision.';
 const {actual,out}=compose(source,'Assisted developers with testing web applications.');
 assert.equal(actual,source);
 assert(out.guardNotes.some(n=>n.path==='entries.work_1.bullets.0'&&n.kind==='restored'&&n.message.includes('supervision qualification')));
});
test('guidance and supervised-by qualifications are not silently dropped',()=>{
 for (const source of ['Developed web applications under the guidance of a mentor.','Developed web applications supervised by a mentor.']) {
  const {actual}=compose(source,'Developed web applications.');assert.equal(actual,source);
 }
});
test('unchanged explicitly supervised source is not rejected',()=>{
 const source='Developed web applications under supervision.';
 const {actual}=compose(source,source);assert.equal(actual,source);
});
// A literal signal can reject a valid paraphrase using a different expression.
test('unrecognized supervision paraphrases are conservatively restored',()=>{
 const source='Assisted developers with testing web applications under supervision.';
 const {actual}=compose(source,'Assisted developers with testing web applications while a mentor oversaw the work.');
 assert.equal(actual,source);
});
test('literal negation guard may restore a valid positive-form paraphrase',()=>{
 const source='Improved delivery workflows without modifying customer data.';
 const {actual}=compose(source,'Improved delivery workflows while leaving customer data unchanged.');
 assert.equal(actual,source); // Known false positive; do not claim general semantic understanding.
});
test('summary cannot silently drop an explicit supervision qualifier',()=>{
 const p=fixture();p.experience.data[0].bullets[0].text='Assisted developers with testing web applications under supervision.';
 const s=n.prepareNaturalComposition(p,job).source,facts=new Map(s.evidence.map(e=>[e.id,e]));
 const response={summarySegments:[{text:'Supported application testing for developers.',sourceIds:['work_1_b1']}],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:facts.get(id).text,sourceIds:[id]}))})),skillSelections:[]};
 const out=n.compileNaturalComposition(p,response,job);
 assert(out.guardNotes.some(note=>note.path==='summarySegments.0'&&note.kind==='removed'&&note.message.includes('supervision qualification')));
 assert.equal(out.candidate.summary.data,p.summary.data.trim());
});

test('moving negation to a different action restores the source',()=>{
 const source='Tested applications but did not deploy production systems.';
 const {out,actual}=compose(source,'Deployed production systems but did not test applications.');
 assert.equal(actual,source);
 assert(out.guardNotes.some(n=>n.path==='entries.work_1.bullets.0'&&n.message.includes('negation may have changed')));
});
test('same negative action remains editable in fictional examples',()=>{
 for(const [source,proposed] of [
  ['Tested applications but did not deploy production systems.','Tested applications without deploying production systems.'],
  ['Improved delivery workflows without modifying customer data.','Improved workflows without modifying customer data.'],
 ]) {const {actual}=compose(source,proposed);assert.equal(actual,proposed);}
});
test('a supporting role cannot silently turn into leadership of a task',()=>{
 const source='Helped developers test applications and review documentation.';
 const {out,actual}=compose(source,'Supported documentation and led application testing.');
 assert.equal(actual,source);
 assert(out.guardNotes.some(n=>n.path==='entries.work_1.bullets.0'&&n.message.includes('leadership was not clearly stated')));
});
test('leadership already stated in a supporting role remains eligible',()=>{
 const source='Helped lead application testing with developers.';
 const proposed='Helped lead testing of applications with developers.';
 assert.equal(compose(source,proposed).actual,proposed);
});
test('negative action matching is a literal signal, not a semantic guarantee',()=>{
 const source='Tested applications but did not deploy production systems.';
 const proposed='Tested applications but did not release production systems.';
 assert.equal(compose(source,proposed).actual,source); // Conservative false positive.
});
test('a summary cannot silently move a negative action to another activity',()=>{
 const p=fixture();p.experience.data[0].bullets[0].text='Tested applications but did not deploy production systems.';
 const s=n.prepareNaturalComposition(p,job).source,facts=new Map(s.evidence.map(e=>[e.id,e]));
 const response={summarySegments:[{text:'Deployed production systems but did not test applications.',sourceIds:['work_1_b1']}],entries:s.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:e.bulletIds.map(id=>({text:facts.get(id).text,sourceIds:[id]}))})),skillSelections:[]};
 const out=n.compileNaturalComposition(p,response,job);
 assert(out.guardNotes.some(n=>n.path==='summarySegments.0'&&n.kind==='removed'&&n.message.includes('negation may have changed')));
});

test('lead time as a noun is not itself a claim of task leadership',()=>{
 const {scopeRisk}=load('services/resumeComposer/scopeRisk');
 assert(!scopeRisk('Supported developers in reducing lead times.', ['Helped developers reduce lead times.']).some(x=>x.includes('leadership')));
});
