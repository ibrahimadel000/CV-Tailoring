'use strict';
// Bounded, manually authorized diagnostic. Never put real cases/results in Git.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const ROOT=path.resolve(__dirname,'..');
const evaluation=require('./evaluate-single-draft.cjs');
const {fixture,job}=require('../tests/helpers/composer-editorial-v4-fixture.cjs');
const {load}=require('../tests/helpers/editorial-loader.cjs');
const natural=load('services/resumeComposer/naturalDocument');
const writer=load('services/resumeComposer/singleDraftRequest');
const {providerFailureMessage}=load('services/resumeComposer/providerDiagnostics');
async function diagnose({casePath,envDir,outputRoot,confirmed=false,fetcher=globalThis.fetch,gitCheck=evaluation.checkGit,log=console.log}){
 if(!confirmed)throw Error('Explicit approval is required. No request was made.');
 if(!casePath||!envDir||!outputRoot)throw Error('Missing case, environment directory, or output directory. No request was made.');
 gitCheck();
 let repo,caseFile,env,out,profileCase,key;
 try{
  repo=fs.realpathSync(ROOT);caseFile=fs.realpathSync(casePath);env=fs.realpathSync(envDir);
  if(!fs.statSync(caseFile).isFile()||fs.statSync(caseFile).size>20*1024*1024)throw Error();
  if(evaluation.isWithin(repo,caseFile))throw Error();
  out=path.resolve(outputRoot);fs.mkdirSync(out,{recursive:true});out=fs.realpathSync(out);
  if(evaluation.isWithin(repo,out))throw Error();
  profileCase=JSON.parse(fs.readFileSync(caseFile,'utf8'));
 }catch{throw Error('Check the private case, environment, and output paths; keep case and output outside the repository. No request was made.');}
 key=evaluation.readKey(env);
 try{
  const packet=natural.prepareNaturalComposition(profileCase.profile,profileCase.job);
  const {wire}=writer.prepareSingleDraftRequest(packet);
  if(wire.length>180000||wire.includes(key))throw Error();
 }catch{key='';throw Error('The private case could not be safely prepared. No request was made.');}
 profileCase=null;
 log('Request 1/3: tiny fictional connectivity check.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),300000);
 try{
  let res;
  try{res=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',{
   method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:controller.signal,
   body:JSON.stringify({contents:[{role:'user',parts:[{text:'Reply with the word OK.'}]}],generationConfig:{maxOutputTokens:8192,thinkingConfig:{thinkingLevel:'medium'}}})
  });}catch{throw Error('Connectivity request failed or timed out. No automatic retry.');}
  if(!res.ok)throw Error(await providerFailureMessage(res));
  let payload;try{payload=await res.json();}catch{throw Error('Connectivity response was invalid. No automatic retry.');}
  const c=payload?.candidates;
  if(!Array.isArray(c)||c.length!==1||c[0]?.finishReason!=='STOP'||!Array.isArray(c[0]?.content?.parts)||!c[0].content.parts.some(p=>!p.thought&&typeof p.text==='string'&&p.text.trim()))throw Error('Connectivity response did not complete. No automatic retry.');
 }finally{clearTimeout(timer);key='';}
 log('Request 1 passed. Request 2/3: fictional CV and tailoring schema.');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cv-tailor-fictional-'));
 try{
  const fictionalCase=path.join(tmp,'fictional-case.json');
  fs.writeFileSync(fictionalCase,JSON.stringify({profile:fixture(),job}),{mode:0o600,flag:'wx'});
  const result=await evaluation.run({casePath:fictionalCase,envDir:env,outputRoot:path.join(tmp,'out'),confirmed:true,fetcher,gitCheck});
  const report=JSON.parse(fs.readFileSync(result.output,'utf8'));
  if(report.compilation?.status!=='compiled')throw Error('The fictional response did not compile. No real CV was sent. No automatic retry.');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 log('Request 2 passed. Request 3/3: your saved private CV and job.');
 const result=await evaluation.run({casePath:caseFile,envDir:env,outputRoot:out,confirmed:true,fetcher,gitCheck});
 log('Diagnostic completed. Private result: '+result.output);
 log('Upload only test-result.PRIVATE.json. It contains your CV and job; keep it private.');
 return result;
}
if(require.main===module){const [casePath,envDir,outputRoot,flag,...rest]=process.argv.slice(2);if(flag!=='--send-up-to-three'||rest.length){console.error('Usage: node scripts/diagnose-gemini38.cjs <private-case.json> <env-directory> <private-output-directory> --send-up-to-three');process.exitCode=1;}else diagnose({casePath,envDir,outputRoot,confirmed:true}).catch(e=>{console.error('Diagnostic stopped: '+e.message);process.exitCode=1;});}
module.exports={diagnose};
