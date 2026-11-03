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
test('loss of supervision without explicit independence remains a known false negative',()=>{
 const {actual}=compose('Assisted developers with testing web applications under supervision.','Assisted developers with testing web applications.');
 assert.equal(actual,'Assisted developers with testing web applications.');
});
test('literal negation guard may restore a valid positive-form paraphrase',()=>{
 const source='Improved delivery workflows without modifying customer data.';
 const {actual}=compose(source,'Improved delivery workflows while leaving customer data unchanged.');
 assert.equal(actual,source); // Known false positive; do not claim general semantic understanding.
});
