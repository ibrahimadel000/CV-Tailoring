'use strict';
// Fictional, author-labeled development probes. Not provider responses, an
// independent holdout, semantic evaluation, or an estimate of production risk.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture}=require('../tests/helpers/composer-editorial-v4-fixture.cjs');
const {load}=require('../tests/helpers/editorial-loader.cjs');
const {prepareNaturalComposition,compileNaturalComposition}=load('services/resumeComposer/naturalDocument');
const {prepareSingleDraftRequest}=load('services/resumeComposer/singleDraftRequest');
const cases=[
 {id:'care-actor',profession:'healthcare',language:'en',role:'Care assistant',source:'Monitored patient comfort during transfers supervised by a nurse.',faithful:'During transfers supervised by a nurse, monitored patient comfort.',risky:'Supervised patient transfers and monitored patient comfort.',concern:'Changes who supervised the transfers.'},
 {id:'classroom-actor',profession:'education',language:'en',role:'Teaching assistant',source:'Prepared classroom materials for lessons led by a teacher.',faithful:'Prepared materials for classroom lessons led by a teacher.',risky:'Led classroom lessons and prepared materials for a teacher.',concern:'Changes who led the lessons.'},
 {id:'invoice-approval',profession:'finance',language:'en',role:'Accounts assistant',source:'Reviewed invoices for a manager to approve.',faithful:'Reviewed invoices for approval by a manager.',risky:'Approved invoices after a manager reviewed them.',concern:'Switches the reviewer and approver.'},
 {id:'hotel-repairs',profession:'hospitality',language:'en',role:'Hotel receptionist',source:'Reported maintenance issues to the hotel engineer.',faithful:'Reported hotel maintenance issues to the engineer.',risky:'Resolved maintenance issues for the hotel engineer.',concern:'Reporting an issue does not establish resolving it.'},
 {id:'apprentice-observation',profession:'trade',language:'en',role:'Electrical apprentice',source:'Observed an electrician installing lighting fixtures during training.',faithful:'Observed lighting fixture installation by an electrician during training.',risky:'Installed lighting fixtures alongside an electrician during training.',concern:'Observation does not establish doing the installation.'},
 {id:'delivery-approval',profession:'software',language:'en',role:'Release assistant',source:'Tested staging deployments after the release manager approved them.',faithful:'Tested staging deployments following the release manager’s approval.',risky:'Approved staging deployments after the release manager tested them.',concern:'Switches testing and approval attribution.'},
 {id:'retail-counts',profession:'retail',language:'en',role:'Retail associate',source:'Processed 30 returns and tracked 20 exchanges.',faithful:'Tracked 20 exchanges and processed 30 returns.',risky:'Processed 20 returns and tracked 30 exchanges.',concern:'Numbers are swapped between different activities.'},
 {id:'manufacturing-measures',profession:'manufacturing',language:'en',role:'Production analyst',source:'Reduced preparation time by 20% and defects by 10%.',faithful:'Reduced defects by 10% and preparation time by 20%.',risky:'Reduced preparation time by 10% and defects by 20%.',concern:'Percentages are swapped between distinct measures.'},
 {id:'community-result',profession:'community services',language:'en',role:'Community coordinator',source:'Organized volunteer schedules, reducing scheduling conflicts.',faithful:'Reduced scheduling conflicts by organizing volunteer schedules.',risky:'Organized volunteer schedules to reduce scheduling conflicts.',concern:'Changes an observed result into a stated purpose.'},
 {id:'design-review',profession:'creative',language:'en',role:'Design assistant',source:'Prepared visual drafts for the art director to review.',faithful:'Prepared visual drafts for review by the art director.',risky:'Reviewed visual drafts prepared by the art director.',concern:'Reverses authorship and review.'},
 {id:'admin-ar-actor',profession:'administration',language:'ar',role:'مساعد إداري',source:'أعددت المستندات للاجتماعات التي أدارها المدير.',faithful:'أعددت المستندات لاجتماعات أدارها المدير.',risky:'أدرت الاجتماعات وأعددت المستندات للمدير.',concern:'Changes who chaired the meetings.'},
 {id:'clinic-ar-task',profession:'healthcare',language:'ar',role:'مساعد عيادة',source:'أبلغت الممرض عن احتياجات المرضى خلال الزيارات.',faithful:'أبلغت الممرض باحتياجات المرضى خلال الزيارات.',risky:'عالجت احتياجات المرضى وأبلغت الممرض خلال الزيارات.',concern:'Reporting needs does not establish treating them.'},
];
function runOne(c,variant){
 const p=fixture();p.profileName=`Fictional relationship probe ${c.id}`;p.summary.data='';p.headline.data=c.role;p.resumeHeader.data.desiredJobPosition=c.role;
 Object.assign(p.experience.data[0],{roleTitle:c.role,companyName:'Fictional organization',city:'',description:'',bullets:[{id:crypto.randomUUID(),text:c.source,isVerified:true}]});
 p.projects.data=[];p.skills.data=[];p.education.data=[];p.certifications.data=[];
 const before=JSON.stringify(p),job=`${c.role}: review relevant responsibilities and experience for this fictional position.`,packet=prepareNaturalComposition(p,job);
 const wire=prepareSingleDraftRequest(packet).wire;assert(wire.includes(c.source));
 const raw={summarySegments:[],entries:packet.source.experience.map(e=>({id:e.id,overview:{text:'',sourceIds:[]},bullets:[{text:variant==='faithful'?c.faithful:c.risky,sourceIds:[e.bulletIds[0]]}]})),skillSelections:[]};
 const result=compileNaturalComposition(p,raw,job);assert.equal(JSON.stringify(p),before,'Source must remain unchanged');
 const proposed=raw.entries[0].bullets[0].text,retained=result.candidate.experience.data[0].bullets.map(b=>b.text);
 return {id:c.id,profession:c.profession,language:c.language,variant,source:c.source,proposed,retained,exactProposalRetained:retained.includes(proposed),notes:result.warnings.map(n=>({path:n.path,message:n.message})),concern:c.concern,semanticStatus:result.semanticStatus};
}
function run(){return cases.flatMap(c=>['faithful','risky'].map(v=>runOne(c,v)));}
if(require.main===module)console.log(JSON.stringify({description:'Fictional author-labeled development probes, not live outputs or independent review.',results:run()},null,2));
module.exports={cases,runOne,run};
