'use strict';
// A fixed fictional case for a separately approved, manual live evaluation.
// This script does not make network requests or read credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture}=require('../tests/helpers/composer-editorial-v4-fixture.cjs');
const {isWithin}=require('./evaluate-single-draft.cjs');
const ROOT=fs.realpathSync(path.resolve(__dirname,'..'));
function makeCase(){
 const profile=fixture(),role='Clinic scheduler';
 profile.profileName='Fictional clinic scheduling case';
 Object.assign(profile.resumeHeader.data,{name:'Fictional Person',firstName:'Fictional',lastName:'Person',desiredJobPosition:role,email:'fictional@example.invalid',phone:'',location:'',linkedin:'',github:'',portfolio:''});
 profile.headline.data=role;profile.summary.data='';
 Object.assign(profile.experience.data[0],{roleTitle:role,companyName:'Fictional clinic',city:'',startDate:'2022',endDate:'2025',description:'',bullets:[
  {id:crypto.randomUUID(),text:'Aligned clinic schedules with laboratory maintenance through proactive planning and cross-team coordination.',isVerified:true},
  {id:crypto.randomUUID(),text:'Prepared appointment updates for the nursing team.',isVerified:true},
 ]});
 profile.projects.data=[];profile.skills.data=[];profile.education.data=[];profile.certifications.data=[];
 return {profile,job:'Clinic scheduler: coordinate patient appointments and communicate schedule changes with nursing and maintenance teams. Facility maintenance management is preferred.'};
}
function writeCase(filename){
 const target=path.resolve(filename),dir=fs.realpathSync(path.dirname(target));
 if(isWithin(ROOT,dir))throw Error('Save the fictional case outside the repository.');
 fs.writeFileSync(path.join(dir,path.basename(target)),JSON.stringify(makeCase(),null,2),{flag:'wx',mode:0o600});
}
if(require.main===module){if(process.argv.length!==3){console.error('Usage: node scripts/fictional-live-case.cjs <new-case-file-outside-repo>');process.exitCode=1;}else try{writeCase(process.argv[2]);console.log('Fictional case created. No network request was made.');}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={makeCase,writeCase};
