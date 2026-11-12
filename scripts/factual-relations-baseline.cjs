'use strict';
// Offline author-written probes, not model output or independent expert review.
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {load}=require('../tests/helpers/editorial-loader.cjs');
const {fixture}=require('../tests/helpers/composer-editorial-v4-fixture.cjs');
const {prepareNaturalComposition,compileNaturalComposition}=load('services/resumeComposer/naturalDocument');
const {singleDraftInstructions,prepareSingleDraftRequest}=load('services/resumeComposer/singleDraftRequest');
const CASES=[
 {id:'healthcare-en',role:'Clinic scheduler',job:'Clinic scheduler: align patient appointments with maintenance schedules and coordinate with staff.',occupation:'healthcare',language:'en',source:'Aligned clinic schedules with laboratory maintenance through proactive planning and cross-team coordination.',faithful:'Aligned clinic schedules with laboratory maintenance through planning and cross-team coordination.',risk:'Coordinated laboratory maintenance and cross-team planning to align clinic schedules.',riskDescription:'Aligning schedules with maintenance does not establish performing or coordinating maintenance.'},
 {id:'community-en',role:'Volunteer coordinator',job:'Volunteer coordinator: organize volunteer schedules around site availability.',occupation:'administration',language:'en',source:'Aligned volunteer schedules with building repairs through planning and team coordination.',faithful:'Aligned volunteer schedules with building repairs through team coordination and planning.',risk:'Coordinated building repairs and team planning to align volunteer schedules.',riskDescription:'Aligning schedules with repairs does not establish coordinating repairs.'},
 {id:'heritage-en',role:'Archive assistant',job:'Archive assistant: catalogue records and coordinate requests with conservation staff.',occupation:'heritage',language:'en',source:'Cataloged rare manuscripts, ensuring seamless coordination between conservation workflows and reading-room requests.',faithful:'Cataloged rare manuscripts, ensuring coordination between conservation workflows and reading-room requests.',risk:'Cataloged rare manuscripts to coordinate conservation workflows with reading-room requests.',riskDescription:'Changing an observed coordination result into a purpose can change the relationship.'},
 {id:'education-en',role:'Teaching assistant',job:'Teaching assistant: organize classroom activity schedules and coordinate with staff.',occupation:'education',language:'en',source:'Aligned classroom activity schedules with school transport through staff coordination.',faithful:'Aligned classroom activity schedules with school transport through coordination with staff.',risk:'Coordinated school transport and staff to align classroom activity schedules.',riskDescription:'Scheduling around transport does not establish coordinating transport.'},
 {id:'hospitality-en',role:'Restaurant host',job:'Restaurant host: organize reservations and coordinate with the restaurant team.',occupation:'hospitality',language:'en',source:'Aligned restaurant reservations with kitchen equipment repairs through team planning.',faithful:'Aligned restaurant reservations with kitchen equipment repairs through planning with the team.',risk:'Coordinated kitchen equipment repairs and team planning to align restaurant reservations.',riskDescription:'Aligning reservations with repairs does not establish coordinating repairs.'},
 {id:'admin-ar',role:'مساعد إداري',job:'مساعد إداري لتنظيم مواعيد الفريق والتنسيق مع الزملاء.',occupation:'administration',language:'ar',source:'نسقت مواعيد الفريق مع أعمال صيانة المبنى من خلال التخطيط المشترك.',faithful:'نسقت مواعيد الفريق مع أعمال صيانة المبنى عبر التخطيط المشترك.',risk:'نسقت أعمال صيانة المبنى والتخطيط المشترك لتنظيم مواعيد الفريق.',riskDescription:'Coordinating team schedules around building maintenance does not establish coordinating the maintenance.'},
];
function runOne(c,variant){
 const p=fixture();p.profileName=`Fictional relation ${c.id}`;p.summary.data='';p.experience.data[0].description='';
 p.resumeHeader.data.desiredJobPosition=c.role;p.headline.data=c.role;p.experience.data[0].roleTitle=c.role;p.experience.data[0].companyName='Fictional organization';
 p.experience.data[0].bullets=[{id:crypto.randomUUID(),text:c.source,isVerified:true}];p.projects.data=[];p.skills.data=[];p.education.data=[];p.certifications.data=[];
 const before=JSON.stringify(p),job=c.job,packet=prepareNaturalComposition(p,job);
 const request=prepareSingleDraftRequest(packet),text=variant==='faithful'?c.faithful:c.risk;
 const raw={summarySegments:[],entries:packet.source.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:[{text,sourceIds:[e.bulletIds[0]]}]})),skillSelections:[]};
 const result=compileNaturalComposition(p,raw,job);assert.equal(JSON.stringify(p),before);
 return {caseId:c.id,occupation:c.occupation,language:c.language,variant,job,source:c.source,proposed:text,retained:result.candidate.experience.data[0].bullets.map(x=>x.text),reviewNotes:result.warnings.map(x=>x.message),riskDescription:c.riskDescription,promptSha256:crypto.createHash('sha256').update(singleDraftInstructions).digest('hex'),requestSha256:crypto.createHash('sha256').update(request.wire).digest('hex'),semanticStatus:result.semanticStatus};
}
function run(){return CASES.flatMap(c=>['faithful','risk'].map(v=>runOne(c,v)));}
if(require.main===module) console.log(JSON.stringify({description:'Offline fictional author-written relationship probes; not live responses or independent review.',results:run()},null,2));
module.exports={CASES,run};
