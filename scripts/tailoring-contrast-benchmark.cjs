'use strict';
// Fictional, hand-labeled development probes. No provider calls or user content.
// Labels are hypotheses for human review, not independent semantic verdicts.
// This blocks only fetch, not all networking, and only in the standalone runner.
if (require.main === module) globalThis.fetch=()=>{ throw new Error('fetch is disabled in this offline benchmark'); };
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const { fixture } = require('../tests/helpers/composer-editorial-v4-fixture.cjs');
const { load } = require('../tests/helpers/editorial-loader.cjs');
const { prepareNaturalComposition, compileNaturalComposition } = load('services/resumeComposer/naturalDocument');
const { prepareSingleDraftRequest } = load('services/resumeComposer/singleDraftRequest');

// Each pair shares one source. Classification distinguishes paraphrases, exact
// controls, omissions, ambiguous wording, and intended unsupported assertions.
const cases = [
 {id:'sql-verb', occupation:'data', language:'en', role:'Reporting assistant', source:['Produced reports with SQL for weekly sales reviews.'], faithful:'Prepared SQL reports for weekly sales reviews.', contrast:'Prepared SQL reports for weekly sales reviews at Cedarvale Labs.', concern:'The organization is not in the source.'},
 {id:'sql-product', contrastClass:'ambiguous', occupation:'data', language:'en', role:'Reporting assistant', source:['SQL supports weekly sales reports.'], faithful:'Weekly sales reports are supported by SQL.', contrast:'Prepared SQL supports weekly sales reports.', concern:'Prepared SQL can be read as the name of an unstated product; capitalization alone cannot reliably distinguish a product name from a verb.'},
 {id:'sql-statements', contrastClass:'unsupported-technique', occupation:'data', language:'en', role:'Reporting assistant', source:['SQL statements protected customer records.'], faithful:'Customer records were protected by SQL statements.', contrast:'Prepared SQL statements protected customer records.', concern:'Prepared statements can denote a specific technique; the source does not establish that technique.'},
 {id:'proper-name', occupation:'heritage', language:'en', role:'Archive assistant', source:['Catalogued exhibits at Cedarvale Museum.'], faithful:'At Cedarvale Museum, catalogued exhibits.', contrast:'Catalogued exhibits at Cedarvale Museum and Mapleford Library.', concern:'The library is not stated.'},
 {id:'technical-name', occupation:'software', language:'en', role:'Developer', source:['Documented REST API behavior for the team.'], faithful:'Documented behavior of the REST API for the team.', contrast:'Documented REST API behavior for the team using Kubernetes.', concern:'The additional technology is not stated.'},
 {id:'actor', occupation:'education', language:'en', role:'Teaching assistant', source:['Prepared activities for lessons led by the teacher.'], faithful:'Prepared activities for teacher-led lessons.', contrast:'Led lessons and prepared activities for the teacher.', concern:'The person leading lessons changes.'},
 {id:'approval', occupation:'finance', language:'en', role:'Accounts assistant', source:['Reviewed invoices for a supervisor to approve.'], faithful:'Reviewed invoices for approval by a supervisor.', contrast:'Approved invoices reviewed by a supervisor.', concern:'Review and approval are attributed to different people.'},
 {id:'count-swap', occupation:'retail', language:'en', role:'Retail associate', source:['Processed 30 returns and tracked 20 exchanges.'], faithful:'Tracked 20 exchanges and processed 30 returns.', contrast:'Processed 20 returns and tracked 30 exchanges.', concern:'The same values attach to the wrong activities.'},
 {id:'metric-swap', occupation:'manufacturing', language:'en', role:'Production analyst', source:['Reduced preparation time by 20% and defects by 10%.'], faithful:'Reduced defects by 10% and preparation time by 20%.', contrast:'Reduced preparation time by 10% and defects by 20%.', concern:'The same percentages attach to different measures.'},
 {id:'range-reversal', faithfulClass:'unchanged-control', occupation:'operations', language:'en', role:'Operations assistant', source:['Reduced processing time from 8 days to 3 days.'], faithful:'Reduced processing time from 8 days to 3 days.', contrast:'Reduced processing time from 3 days to 8 days.', concern:'Endpoints are reversed.'},
 {id:'observation', occupation:'trades', language:'en', role:'Electrical apprentice', source:['Observed an electrician installing lighting fixtures during training.'], faithful:'Observed an electrician install lighting fixtures during training.', contrast:'Installed lighting fixtures during training with an electrician.', concern:'Observation is promoted to performing installation.'},
 {id:'arabic-actor', occupation:'administration', language:'ar', role:'مساعد إداري', source:['أعددت المستندات للاجتماعات التي أدارها المدير.'], faithful:'أعددت المستندات لاجتماعات أدارها المدير.', contrast:'أدرت الاجتماعات وأعددت المستندات للمدير.', concern:'The actor leading meetings changes.'},
 {id:'arabic-counts', occupation:'logistics', language:'ar', role:'مساعد مخزون', source:['راجعت ٣٠ طلباً وجهزت ٢٠ شحنة.'], faithful:'جهزت ٢٠ شحنة وراجعت ٣٠ طلباً.', contrast:'راجعت ٢٠ طلباً وجهزت ٣٠ شحنة.', concern:'The quantities attach to different activities.'},
 {id:'multi-omission', faithfulClass:'faithful-combination', contrastClass:'omission', occupation:'healthcare', language:'en', role:'Clinic assistant', source:['Prepared patient appointment lists.', 'Recorded appointment changes for the nursing team.'], faithful:'Prepared patient appointment lists; recorded appointment changes for the nursing team.', contrast:'Prepared patient appointment lists.', concern:'Both sources are cited but the second contribution is omitted; completeness is separate from unsupported additions.', citations:[0,1]},
 {id:'multi-actor', faithfulClass:'faithful-combination', occupation:'hospitality', language:'en', role:'Hotel receptionist', source:['Reported repair issues to the engineer.', 'Recorded room availability for the front desk.'], faithful:'Reported repair issues to the engineer; recorded room availability for the front desk.', contrast:'Repaired issues and recorded room availability for the front desk.', concern:'Reporting repairs is not performing them.', citations:[0,1]},
];
function runOne(c, variant) {
 const p=fixture();
 p.profileName='Fictional benchmark'; p.summary.data=''; p.headline.data=c.role;
 Object.assign(p.resumeHeader.data,{name:'Fictional Person',firstName:'Fictional',lastName:'Person',desiredJobPosition:c.role,email:'',phone:'',location:'',linkedin:'',github:'',portfolio:''});
 Object.assign(p.experience.data[0],{roleTitle:c.role,companyName:'Fictional organization',city:'',startDate:'',endDate:'',description:'',bullets:c.source.map(text=>({id:crypto.randomUUID(),text,isVerified:true}))});
 p.projects.data=[]; p.skills.data=[]; p.education.data=[]; p.certifications.data=[]; p.customSections=[];
 const before=JSON.stringify(p), job=`Fictional ${c.role} position: relevant responsibilities.`;
 assert(['faithful','contrast'].includes(variant),'invalid variant');
 const packet=prepareNaturalComposition(p,job), wire=JSON.parse(prepareSingleDraftRequest(packet).wire);
 assert.equal(packet.job,job); assert.equal(wire.job,job); assert.deepEqual(wire.source,packet.source);
 assert.equal(packet.source.experience.length,1); const e=packet.source.experience[0];
 assert.equal(e.bulletIds.length,c.source.length); assert.equal(new Set(e.bulletIds).size,c.source.length);
 for (const [i,id] of e.bulletIds.entries()) {
  const matches=wire.source.evidence.filter(f=>f.id===id);
  assert.equal(matches.length,1,'each source ID must resolve uniquely');
  assert.deepEqual({kind:matches[0].kind,parent:matches[0].parent,text:matches[0].text},{kind:'achievement',parent:e.id,text:c.source[i]});
 }
 const indexes=c.citations || [0], text=c[variant];
 assert.equal(new Set(indexes).size,indexes.length); assert(indexes.every(i=>Number.isInteger(i)&&i>=0&&i<c.source.length));
 const raw={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[{text,sourceIds:indexes.map(i=>e.bulletIds[i])}]}],skillSelections:[]};
 const out=compileNaturalComposition(p,raw,job);
 assert.equal(JSON.stringify(p),before,'source profile mutated');
 const retained=out.candidate.experience.data[0].bullets.map(b=>b.text);
 return {id:c.id,occupation:c.occupation,language:c.language,variant,classification:variant==='faithful'?(c.faithfulClass || 'supported-paraphrase'):(c.contrastClass || 'unsupported-claim'),source:c.source,citations:indexes.map(i=>({sourceIndex:i,sourceId:e.bulletIds[i],sourceText:c.source[i]})),proposed:text,retained,exactProposalRetained:retained.includes(text),guardNotes:out.guardNotes.map(({path,kind,message})=>({path,kind,message})),warnings:out.warnings.map(({path,message})=>({path,message})),semanticStatus:out.semanticStatus,concern:c.concern};
}
function run() { return cases.flatMap(c=>['faithful','contrast'].map(v=>runOne(c,v))); }
// Isolated counterfactual: add one sentence-initial verb to a transpiled in-memory
// copy of terms.ts. This is NOT a changed compiler or a recommendation to ship.
function verbExceptionExperiment() {
 const file=path.join(__dirname,'../src/services/resumeComposer/terms.ts');
 const original=fs.readFileSync(file,'utf8'), needle='engineered streamlined aligned conducted';
 assert.equal(original.split(needle).length,2,'experiment anchor changed');
 const altered=original.replace(needle,'prepared '+needle);
 const m=new Module(file,module); m.filename=file; m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(ts.transpileModule(altered,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
 const current=load('services/resumeComposer/terms');
 return ['sql-verb','sql-product','sql-statements'].map(id=>{
  const c=cases.find(x=>x.id===id), variant=id==='sql-verb'?'faithful':'contrast', text=c[variant];
  return {id,variant,classification:variant==='faithful'?'supported-paraphrase':(c.contrastClass || 'unsupported-claim'),source:c.source,proposed:text,currentUnsupported:current.analyzeTerms(text,c.source,[]).unsupported.map(x=>x.label),withPreparedException:m.exports.analyzeTerms(text,c.source,[]).unsupported.map(x=>x.label)};
 });
}
// Hash a sorted manifest of the complete src tree and selected harness inputs.
// This is a content fingerprint, not an independently verified Git commit or a
// fingerprint of installed dependency bytes or every aspect of the environment.
function provenance() {
 const root=path.join(__dirname,'..');
 function files(dir) { return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(`${dir}/${d.name}`):d.isFile()?[`${dir}/${d.name}`]:[]); }
 const paths=[...files('src'),'package-lock.json','scripts/tailoring-contrast-benchmark.cjs','tests/helpers/composer-editorial-v4-fixture.cjs','tests/helpers/editorial-loader.cjs','tests/tailoring-contrast-benchmark.test.cjs'].sort();
 const manifest=paths.map(p=>`${p} ${crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}`).join('\n');
 return {sourceAndHarnessManifestSha256:crypto.createHash('sha256').update(manifest).digest('hex'),manifestFileCount:paths.length,nodeVersion:process.version,typescriptVersion:ts.version,commit:'unverified; no Git metadata in this copy',scope:'src tree, lockfile, benchmark script, benchmark test, and two fixture/loader files; not installed dependencies or full environment'};
}
function report() {
 return {description:'Fictional author-labeled development probes; not provider output, independent review, or production error rates.',limitation:'Results are per case, without mixed-type aggregate scores. Exact retention is observable, not a semantic verdict. Review notes do not remove text.',provenance:provenance(),termOnlyCounterfactual:verbExceptionExperiment(),results:run()};
}
if(require.main===module) console.log(JSON.stringify(report(),null,2));
module.exports={cases,runOne,run,report,verbExceptionExperiment};
