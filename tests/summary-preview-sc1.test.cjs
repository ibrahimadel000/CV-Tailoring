// Offline isolated adapter checks. Schema/compiler mocked here; full native suite runs separately.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const request=read('src/services/resumeComposer/request.ts'),writer=read('src/services/resumeComposer/singleDraftRequest.ts');
const instructions=vm.runInNewContext(writer.match(/export const singleDraftInstructions = (`[\s\S]*?`);/)[1]);
const fakePacket={revision:'synthetic-offline-packet',source:{fictional:true}},fakeSchema={type:'OBJECT',properties:{synthetic:{type:'STRING'}}};
function adapter(fetchImpl,{ready=true,development=true,timers={setTimeout,clearTimeout}}={}){
 const records=[];class TailorError extends Error{constructor(code,message){super(message);this.code=code;}}
 let code=stripTypeScriptTypes(request,{mode:'strip'}).replace(/^import .*;\s*$/gm,'')
  .replaceAll('import.meta.env.DEV',String(development)).replaceAll('import.meta.env.VITE_GEMINI_API_KEY',"'synthetic-preview-key'")
  .replace(/^export /gm,'');
 code='const {providerFailureMessage,singleDraftInstructions,prepareSingleDraftRequest,TailorError,getTailorConnection,saveTailorUsage}=mocks;\n'+code+'\nmodule.exports={requestComposition,COMPOSITION_MODEL,COMPOSITION_TIMEOUT_MS,COMPOSITION_PREVIEW_LABEL};';
 const module={exports:{}};
 vm.runInNewContext(code,{module,mocks:{providerFailureMessage:async res=>`Provider HTTP ${res.status}. No automatic retry.`,singleDraftInstructions:instructions,
  prepareSingleDraftRequest:p=>{a.deepEqual(p,fakePacket);return {wire:JSON.stringify(fakePacket),responseSchema:fakeSchema};},TailorError,getTailorConnection:()=>({ready:ready&&development}),saveTailorUsage:r=>records.push(JSON.parse(JSON.stringify(r)))},
  fetch:fetchImpl,AbortController,DOMException,performance,crypto:global.crypto,setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout});
 return {...module.exports,records};
}
const signal=()=>new AbortController().signal;
const jsonResponse=body=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
const complete=raw=>jsonResponse({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'NOT_FOR_EXPORT'},{text:JSON.stringify(raw)}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:5}});
test('single-draft prompt and UI visibly name the actual experimental preview/model',()=>{
 a(instructions.includes('one focused, readable resume'));a(instructions.includes('not independent proof'));a(instructions.includes('not candidate facts'));
 const ui=read('src/components/builder/ComposerTailorWorkspace.tsx');a(ui.includes('COMPOSITION_PREVIEW_LABEL'));a(ui.includes('Experimental tailoring preview'));a(!ui.includes('Gemini 2.5 Flash'));
});
test('one actual adapter invocation uses 3.8 Flash compatible settings, full packet/schema and candidate instructions',async()=>{
 let calls=0;const raw={summarySegments:[],entries:[],skillSelections:[]};
 const x=adapter(async(url,options)=>{calls++;a(url.endsWith('/gemini-3.8-flash:generateContent'));a.equal(options.redirect,'error');
  const body=JSON.parse(options.body);a.deepEqual(JSON.parse(body.contents[0].parts[0].text),fakePacket);a.equal(body.systemInstruction.parts[0].text,instructions);
  a.deepEqual(body.generationConfig,{responseMimeType:'application/json',responseSchema:fakeSchema,maxOutputTokens:8192,thinkingConfig:{thinkingLevel:'medium'}});
  a.equal(options.headers['x-goog-api-key'],'synthetic-preview-key');a(!options.body.includes('synthetic-preview-key'));return complete(raw);
 });
 a.deepEqual(JSON.parse(JSON.stringify(await x.requestComposition(fakePacket,signal()))),raw);a.equal(calls,1);
 a.equal(x.COMPOSITION_MODEL,'gemini-3.8-flash');a.equal(x.COMPOSITION_PREVIEW_LABEL,'Single-draft preview · Gemini 3.8 Flash · experimental');
 a.equal(x.records[0].model,'gemini-3.8-flash');a.equal(x.records[0].status,'success');a.equal(x.records[0].attempts,1);a(!JSON.stringify(x.records).includes('NOT_FOR_EXPORT'));
});
for(const status of [429,503])test('HTTP'+status+' stops one fetch, records failure, never retries',async()=>{
 let calls=0;const x=adapter(async()=>{calls++;return {ok:false,status};});
 await a.rejects(x.requestComposition(fakePacket,signal()),/No automatic retry/);a.equal(calls,1);a.equal(x.records[0].status,'failed');
});
for(const [label,body] of [['multiple',{candidates:[{finishReason:'STOP'},{finishReason:'STOP'}]}],['partial',{candidates:[{finishReason:'MAX_TOKENS'}]}],['bad JSON',{candidates:[{finishReason:'STOP',content:{parts:[{text:'bad-json'}]}}]}]])test('invalid response '+label+' never returns partial content',async()=>{
 let calls=0;const x=adapter(async()=>{calls++;return jsonResponse(body);});await a.rejects(x.requestComposition(fakePacket,signal()));a.equal(calls,1);a.equal(x.records[0].status,'failed');
});
test('300s deadline aborts pending fetch and reports timeout with no retry',async()=>{
 let fire,calls=0;const handle={};const x=adapter(async(_url,options)=>{calls++;return new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));fire();});},{timers:{setTimeout:(fn,ms)=>{a.equal(ms,300000);fire=fn;return handle;},clearTimeout:id=>a.equal(id,handle)}});
 await a.rejects(x.requestComposition(fakePacket,signal()),e=>e.code==='timeout');a.equal(calls,1);a.equal(x.records[0].reason,'timeout');
});
test('pre-cancelled request makes zero fetches',async()=>{let calls=0;const x=adapter(async()=>calls++),c=new AbortController();c.abort();await a.rejects(x.requestComposition(fakePacket,c.signal));a.equal(calls,0);});
test('unconfigured and production-disabled connection make zero fetches',async()=>{for(const options of [{ready:false},{development:false}]){let calls=0;const x=adapter(async()=>calls++,options);await a.rejects(x.requestComposition(fakePacket,signal()),e=>e.code==='configuration');a.equal(calls,0);}});
test('metrics contain no packet, prompt, key or response document',async()=>{
 const x=adapter(async()=>complete({summarySegments:[{text:'FICTIONAL_PRIVATE_SENTINEL',sourceIds:['fictional']}],entries:[],skillSelections:[]}));await x.requestComposition(fakePacket,signal());
 for(const value of ['FICTIONAL_PRIVATE_SENTINEL','synthetic-preview-key',instructions])a(!JSON.stringify(x.records).includes(value));
});
for(const model of ['gemini-3-flash-preview','gemini-3.8-flash']) test('explicit '+model+' selection makes one request and records the selected model',async()=>{
 let calls=0;const x=adapter(async(url)=>{calls++;a(url.endsWith('/'+model+':generateContent'));return complete({summarySegments:[],entries:[],skillSelections:[]})});
 await x.requestComposition(fakePacket,signal(),model);a.equal(calls,1);a.equal(x.records[0].model,model);a.equal(x.records[0].attempts,1);
});
test('unsupported model fails before any fetch',async()=>{let calls=0;const x=adapter(async()=>{calls++;});await a.rejects(x.requestComposition(fakePacket,signal(),'unknown-model'),/Unsupported model/);a.equal(calls,0);a.equal(x.records.length,0);});
test('selected model error never falls back to another model',async()=>{let calls=0;const x=adapter(async(url)=>{calls++;a(url.endsWith('/gemini-3.8-flash:generateContent'));return {ok:false,status:503};});await a.rejects(x.requestComposition(fakePacket,signal(),'gemini-3.8-flash'),/No automatic retry/);a.equal(calls,1);a.equal(x.records[0].model,'gemini-3.8-flash');});
