'use strict';
// One pre-approved case; no retries, fallbacks, additional providers, or browser storage.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const { load } = require(path.join(ROOT,'tests/helpers/editorial-loader.cjs'));
const natural = load('services/resumeComposer/naturalDocument');
const { summarizeChanges, summarizeProposal } = load('services/resumeComposer/changeSummary');
const MODEL = 'gemini-3.5-flash-lite', TIMEOUT_MS = 300000, MAX_OUTPUT = 8192;
const BASE = '014ba401b22c3e70fbd1b3ad71c61219f87cef2c';
const PROMPT_HASH = 'ab67009d35ee445d7d91803092a2ca94b96aa6143145228eec9f64e5d824d391';
const REVISION = 'document-compose-natural-segments-13-draft-first-preview';
const ID = 'CV-Tailor-SC59-20261106-OneShot-R6';
const DEADLINE_UTC = '2026-11-06T20:00:00.000Z';
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
function readKey(envPath) {
  const {loadEnv} = require(path.join(ROOT,'node_modules/vite'));
  const value = (loadEnv('development', path.dirname(envPath), 'VITE_').VITE_GEMINI_API_KEY || '').trim();
  if (!value || /[\r\n]/.test(value) || /^(?:your_gemini_api_key_here|undefined|null)$/i.test(value)) throw Error('The selected development key is empty or a placeholder. No request was made.');
  return value;
}
// Only a clean checkout whose sole change from the tested candidate is this runner.
function checkGit(root=ROOT, expectedBase=BASE) {
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  try {
    if(git('rev-parse','HEAD^')!==expectedBase) throw Error();
    if(git('diff','--name-only',expectedBase,'HEAD')!=='scripts/private-r6-one-request.cjs') throw Error();
    if(git('status','--porcelain','--untracked-files=normal')) throw Error();
  } catch { throw Error('The isolated Git checkout is not the expected clean test revision. No request was made.'); }
}
function prepare({casePath=path.join(os.homedir(),'Downloads','CV-Tailor-One-Request-R5','case.private.json'),caseHash=process.env.CV_TAILOR_CASE_SHA256,sourceHash=process.env.CV_TAILOR_SOURCE_SHA256,checkGitFn=checkGit}={}) {
  checkGitFn();
  if (!/^[a-f0-9]{64}$/.test(caseHash||'') || !/^[a-f0-9]{64}$/.test(sourceHash||'')) throw Error('Missing test integrity values. No request was made.');
  let bytes,fixture;try{bytes=fs.readFileSync(casePath);if(hash(bytes)!==caseHash)throw Error();fixture=JSON.parse(bytes.toString('utf8'));}catch{throw Error('The private test case is missing or does not match. No request was made.');}
  const packet=natural.prepareNaturalComposition(fixture.profile,fixture.job);
  if (hash(JSON.stringify(packet.source)) !== sourceHash || packet.revision !== REVISION || hash(natural.naturalInstructions) !== PROMPT_HASH) throw Error('Test source or candidate mismatch. No request was made.');
  const deadline=Date.parse(DEADLINE_UTC);
  if (Date.now()>=deadline) throw Error('The approval window expired. No request was made; request a fresh agreement.');
  const body={systemInstruction:{parts:[{text:natural.naturalInstructions}]},contents:[{role:'user',parts:[{text:JSON.stringify(packet)}]}],generationConfig:{responseMimeType:'application/json',responseSchema:natural.googleNaturalSchema(packet),maxOutputTokens:MAX_OUTPUT,thinkingConfig:{thinkingLevel:'medium'}}};
  if (body.contents[0].parts[0].text.length>180000) throw Error('Request exceeds the source limit. No request was made.');
  return {fixture,packet,body,deadline,sourceHash};
}
async function run({fetcher=globalThis.fetch,envPath=process.argv[2] || 'E:\\cv tailor - Copy\\.env',outputDirectory=path.join(os.homedir(),ID),prepareFn=prepare}={}) {
  const {fixture,packet,body,deadline,sourceHash}=prepareFn();
  let key;try{key=readKey(envPath)}catch{throw Error('Could not load a usable development key. No request was made.');}
  fs.mkdirSync(outputDirectory,{recursive:true});
  const marker=path.join(outputDirectory,'ONE-ATTEMPT-USED.txt');let fd;
  try{fd=fs.openSync(marker,'wx',0o600)}catch(e){if(e.code==='EEXIST')throw Error('The one-attempt test has already been reserved. Do not retry.');throw Error('Could not create the attempt marker. No request was made.')}
  try{fs.writeFileSync(fd,`Attempt reserved ${new Date().toISOString()}; do not rerun.\n`)}finally{fs.closeSync(fd)}
  if(Date.now()>=deadline) throw Error('Approval expired before sending. Attempt is closed; no request was made.');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try {
    let response;
    try{response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:controller.signal,body:JSON.stringify(body)})}
    catch{throw Error('Request failed or timed out. No automatic retry. The attempt is closed.');}
    if(!response.ok){const {providerFailureMessage}=load('services/resumeComposer/providerDiagnostics'); const message=await providerFailureMessage(response); throw Error(message+' The attempt is closed.');}
    let payload;try{payload=await response.json()}catch{throw Error('The response was not valid JSON. No automatic retry. The attempt is closed.')}
    if (!Array.isArray(payload?.candidates) || payload.candidates.length!==1 || payload.candidates[0]?.finishReason!=='STOP') throw Error('The response did not complete. No automatic retry. The attempt is closed.');
    const parts=payload.candidates[0]?.content?.parts;
    if(!Array.isArray(parts)||parts.some(p=>!p||typeof p!=='object'||(!p.thought&&typeof p.text!=='string')))throw Error('The response format was invalid. No automatic retry. The attempt is closed.');
    const text=parts.filter(p=>!p.thought).map(p=>p.text).join('');
    if(!text||text.length>100000||text.includes(key))throw Error('The response was empty, oversized, or contained a secret. No response was saved.');
    let authoredDocument;try{authoredDocument=JSON.parse(text)}catch{throw Error('The model response was not valid JSON. No automatic retry. The attempt is closed.')}
    const report={testId:ID,recordedAt:new Date().toISOString(),model:MODEL,settings:{thinkingLevel:'medium',maxOutputTokens:MAX_OUTPUT,timeoutMs:TIMEOUT_MS,attempts:1},sourceSha256:sourceHash,promptSha256:hash(natural.naturalInstructions),revision:packet.revision,job:packet.job,source:packet.source,authoredDocument};
    try{
      const result=natural.compileNaturalComposition(fixture.profile,authoredDocument,packet.job);
      report.compilation={status:'compiled',summary:result.candidate.summary.data,experience:result.candidate.experience.data.map(e=>({roleTitle:e.roleTitle,companyName:e.companyName,description:e.description,bullets:e.bullets.map(b=>b.text)})),projects:result.candidate.projects.data.map(e=>({name:e.name,bullets:e.bullets.map(b=>b.text)})),skills:result.candidate.skills.data.map(s=>({name:s.name,category:s.category,level:s.level})),warnings:result.warnings,proposal:summarizeProposal(packet.source,authoredDocument),changes:summarizeChanges(fixture.profile,result.candidate),semanticStatus:result.semanticStatus};
    }catch{report.compilation={status:'failed',message:'Local compilation failed. Inspect the captured response; no retry.'}}
    const output=path.join(outputDirectory,'test-result.PRIVATE.json');const serialized=JSON.stringify(report,null,2);
    if(serialized.includes(key)) throw Error('The result contained a secret and was not saved. The attempt is closed.');
    fs.writeFileSync(output,serialized,{flag:'wx',mode:0o600});
    console.log('One request completed. Private result saved at: '+output);console.log('Upload only test-result.PRIVATE.json to this chat for review. It contains CV and job information; keep it private.');
    return {status:'completed',output};
  } finally {clearTimeout(timer);key='';}
}
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={run,prepare,readKey,hash,checkGit};
