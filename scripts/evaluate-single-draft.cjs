'use strict';
// Private, manually invoked evaluation: at most one request per invocation.
// Never commit the case, result, .env, credentials, or provider response.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const {load}=require(path.join(ROOT,'tests/helpers/editorial-loader.cjs'));
const natural=load('services/resumeComposer/naturalDocument');
const writer=load('services/resumeComposer/singleDraftRequest');
const {summarizeChanges,summarizeProposal}=load('services/resumeComposer/changeSummary');
const {providerFailureMessage}=load('services/resumeComposer/providerDiagnostics');
const DEFAULT_MODEL='gemini-3.5-flash-lite',TIMEOUT_MS=300000;
// Explicit modes preserve the original runner while allowing a one-shot test of
// the app's primary model with the same output budget and thinking setting.
const MODEL_SETTINGS=Object.freeze({
 'gemini-3.5-flash-lite':Object.freeze({maxOutputTokens:8192,thinkingLevel:'medium'}),
 'gemini-3.8-flash':Object.freeze({maxOutputTokens:24576,thinkingLevel:'low'}),
});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function isWithin(parent,child){const r=path.relative(parent,child);return !r || (!r.startsWith('..'+path.sep) && r!=='..' && !path.isAbsolute(r));}
function checkGit(){try{const git=(...args)=>execFileSync('git',['-C',ROOT,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();const commit=git('rev-parse','HEAD');if(!/^[a-f0-9]{40}$/.test(commit)||git('status','--porcelain','--untracked-files=normal'))throw Error();return commit;}catch{throw Error('Use a clean, separate Git checkout. No request was made.');}}
function readKey(envDir){const value=(require(path.join(ROOT,'node_modules/vite')).loadEnv('development',envDir,'VITE_').VITE_GEMINI_API_KEY||'').trim();if(!value||/[\r\n]/.test(value)||/^(?:your_gemini_api_key_here|undefined|null)$/i.test(value))throw Error('No usable development key was found. No request was made.');return value;}
// Never print raw error messages: fetch errors can contain request details or secrets.
function networkFailure(error,timedOut){
 if(timedOut)return 'Request timed out after five minutes. The provider may have received it. No automatic retry.';
 const allowed=new Set(['EAI_AGAIN','ENOTFOUND','ECONNRESET','ETIMEDOUT','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','ERR_TLS_CERT_ALTNAME_INVALID','UND_ERR_INVALID_ARG','ERR_INVALID_CHAR']);
 const code=typeof error?.cause?.code==='string'?error.cause.code:error?.code;
 return 'Request failed before a usable response'+(allowed.has(code)?` (connection code: ${code})`:' (cause unclassified)')+'. The provider may have received it. No automatic retry.';
}
function validateKeyHeader(key){try{new Headers({'x-goog-api-key':key});}catch{throw Error('The key cannot be used as an HTTP header. No request was made.');}}
async function run({casePath,envDir,outputRoot,confirmed=false,model=DEFAULT_MODEL,fetcher=globalThis.fetch,gitCheck=checkGit}){
 if(!confirmed)throw Error('No request was made. Explicitly approve the case and add --send-one-request.');
 if(!Object.hasOwn(MODEL_SETTINGS,model))throw Error('Unsupported evaluation model. No request was made.');
 if(!casePath||!envDir||!outputRoot)throw Error('Missing case, environment directory, or output directory. No request was made.');
 const commit=gitCheck(), repo=fs.realpathSync(ROOT), caseFile=fs.realpathSync(casePath), env=fs.realpathSync(envDir), out=path.resolve(outputRoot);
 if(isWithin(repo,caseFile)||isWithin(repo,out))throw Error('Keep the private case and result directory outside the repository. No request was made.');
 const info=fs.statSync(caseFile);if(!info.isFile()||info.size>20*1024*1024)throw Error('Invalid private case. No request was made.');
 let bytes,fixture;try{bytes=fs.readFileSync(caseFile);fixture=JSON.parse(bytes.toString('utf8'));}catch{throw Error('Could not read the private case. No request was made.');}
 const packet=natural.prepareNaturalComposition(fixture.profile,fixture.job),{wire,responseSchema}=writer.prepareSingleDraftRequest(packet);
 if(wire.length>180000)throw Error('Request exceeds the input budget. No request was made.');
 let key=readKey(env);validateKeyHeader(key);if(wire.includes(key))throw Error('A secret appears in the request data. No request was made.');
 fs.mkdirSync(out,{recursive:true});const resolvedOut=fs.realpathSync(out);if(isWithin(repo,resolvedOut))throw Error('Keep the private result directory outside the repository. No request was made.');
 const dir=fs.mkdtempSync(path.join(resolvedOut,'run-'));const body={systemInstruction:{parts:[{text:writer.singleDraftInstructions}]},contents:[{role:'user',parts:[{text:wire}]}],generationConfig:{responseMimeType:'application/json',responseSchema,maxOutputTokens:MODEL_SETTINGS[model].maxOutputTokens,thinkingConfig:{thinkingLevel:MODEL_SETTINGS[model].thinkingLevel}}};
 const controller=new AbortController();let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},TIMEOUT_MS);
 try{
  let res;try{res=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:controller.signal,body:JSON.stringify(body)});}catch(error){throw Error(networkFailure(error,timedOut));}
  if(!res.ok)throw Error((await providerFailureMessage(res))+' No automatic retry.');
  let payload;try{payload=await res.json();}catch{throw Error('Invalid provider response. No automatic retry.');}
  const blocked=ratings=>Array.isArray(ratings)&&ratings.some(r=>r?.blocked===true);
  if(payload?.promptFeedback?.blockReason||blocked(payload?.promptFeedback?.safetyRatings)||(Array.isArray(payload?.candidates)&&payload.candidates.some(c=>blocked(c?.safetyRatings))))throw Error('Provider restricted the request or response. No automatic retry.');
  if(!Array.isArray(payload?.candidates)||payload.candidates.length!==1||payload.candidates[0]?.finishReason!=='STOP')throw Error('Provider response did not complete. No automatic retry.');
  const parts=payload.candidates[0]?.content?.parts;if(!Array.isArray(parts)||parts.some(p=>!p||typeof p!=='object'||(!p.thought&&typeof p.text!=='string')))throw Error('Invalid provider response format. No automatic retry.');
  const text=parts.filter(p=>!p.thought).map(p=>p.text).join('');if(!text||text.length>100000||text.includes(key))throw Error('Empty, oversized, or sensitive response was not saved. No automatic retry.');
  let authoredDocument;try{authoredDocument=JSON.parse(text);}catch{throw Error('Invalid provider JSON. No automatic retry.');}
  const report={testId:'single-draft-private-evaluation',recordedAt:new Date().toISOString(),gitCommit:commit,model,settings:{...MODEL_SETTINGS[model],timeoutMs:TIMEOUT_MS,attempts:1},caseSha256:hash(bytes),sourceSha256:hash(JSON.stringify(packet.source)),promptSha256:hash(writer.singleDraftInstructions),wireSha256:hash(wire),revision:packet.revision,job:packet.job,source:packet.source,authoredDocument};
  // Provider-reported version and token counts are observations, not proof of quality.
  if(typeof payload.modelVersion==='string'&&payload.modelVersion.length<=200)report.providerModelVersion=payload.modelVersion;
  if(payload.usageMetadata&&typeof payload.usageMetadata==='object'){
   const count=name=>Number.isSafeInteger(payload.usageMetadata[name])&&payload.usageMetadata[name]>=0?payload.usageMetadata[name]:undefined;
   report.usage={input:count('promptTokenCount'),output:count('candidatesTokenCount'),thoughts:count('thoughtsTokenCount'),total:count('totalTokenCount')};
  }
  try{const result=natural.compileNaturalComposition(fixture.profile,authoredDocument,packet.job);report.compilation={status:'compiled',summary:result.candidate.summary.data,experience:result.candidate.experience.data.map(e=>({roleTitle:e.roleTitle,companyName:e.companyName,description:e.description,bullets:e.bullets.map(b=>b.text)})),projects:result.candidate.projects.data.map(e=>({name:e.name,bullets:e.bullets.map(b=>b.text)})),skills:result.candidate.skills.data.map(s=>({name:s.name,category:s.category,level:s.level})),warnings:result.warnings,proposal:summarizeProposal(packet.source,authoredDocument),changes:summarizeChanges(fixture.profile,result.candidate),semanticStatus:result.semanticStatus};}catch{report.compilation={status:'failed',message:'Local compilation failed. No copy was created and no retry was made.'};}
  const serialized=JSON.stringify(report,null,2);if(serialized.includes(key))throw Error('The result contained a secret and was not saved. No automatic retry.');
  const output=path.join(dir,'test-result.PRIVATE.json');fs.writeFileSync(output,serialized,{flag:'wx',mode:0o600});
  return {status:'completed',output};
 }finally{clearTimeout(timer);key='';}
}
if(require.main===module){
 const [casePath,envDir,outputRoot,flag,modelFlag,...rest]=process.argv.slice(2);
 const model=modelFlag?.startsWith('--model=')?modelFlag.slice('--model='.length):DEFAULT_MODEL;
 if(flag!=='--send-one-request'||rest.length||(modelFlag&&!modelFlag.startsWith('--model='))){console.error('Usage: node scripts/evaluate-single-draft.cjs <case.json> <env-directory> <output-directory> --send-one-request [--model=gemini-3.8-flash]');process.exitCode=1;}
 else run({casePath,envDir,outputRoot,confirmed:true,model}).then(x=>{console.log('One request completed. Private result: '+x.output);console.log('Share only if you want to: the result contains the case and job.');}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={run,readKey,checkGit,isWithin,networkFailure,validateKeyHeader};
