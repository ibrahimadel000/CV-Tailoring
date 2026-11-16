// No network, credentials or real resume data. A deliberately uncooperative transport
// reproduces operations that do not settle merely because AbortSignal was triggered.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(root);const normal=m.require.bind(m);m.require=id=>id.startsWith('@/')?load(path.join(root,'src',id.slice(2)+'.ts')):id.startsWith('.')&&fs.existsSync(path.resolve(path.dirname(file),id+'.ts'))?load(path.resolve(path.dirname(file),id+'.ts')):normal(id);cache.set(file,m);const src=fs.readFileSync(file,'utf8').replaceAll('import.meta.env.DEV','true').replaceAll('import.meta.env.VITE_GEMINI_API_KEY',"'offline-fake-key-not-a-credential'");m._compile(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);return m.exports;}
const get=p=>load(path.join(root,'src',p+'.ts'));
const {requestComposition}=get('services/resumeComposer/request'),{prepareNaturalComposition}=get('services/resumeComposer/naturalDocument'),{createSampleProfile}=get('mock/profile');
const job='Fictional clinic scheduler: prepare appointment updates and communicate with nursing staff.';
const realSetTimeout=global.setTimeout,realClearTimeout=global.clearTimeout;
const within=async p=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=realSetTimeout(()=>reject(Error('request remained pending after deadline')),500)})])}finally{realClearTimeout(timer)}};
for(const phase of ['fetch','success body','error body']) test(`deadline settles uncooperative ${phase} without retry or sensitive output`,async()=>{
 const oldFetch=global.fetch,oldSet=global.setTimeout,oldClear=global.clearTimeout,oldStorage=global.localStorage;
 let fire,ready,release,calls=0;const readyPromise=new Promise(r=>ready=r),storage=new Map(),timerHandle={};
 global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 global.setTimeout=(fn,ms,...args)=>ms===300000?(fire=fn,timerHandle):oldSet(fn,ms,...args);
 global.clearTimeout=h=>h===timerHandle?undefined:oldClear(h);
 global.fetch=()=>{calls++;if(phase==='fetch')return new Promise(resolve=>{release=()=>resolve(new Response('',{status:503}));ready();});
  if(phase==='success body'){ready();return Promise.resolve({ok:true,json:()=>new Promise(resolve=>{release=()=>resolve({candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]});})});}
  let cancelled=false;const stream=new ReadableStream({start(c){release=()=>{if(!cancelled)c.close();};ready();},cancel(){cancelled=true;}});return Promise.resolve(new Response(stream,{status:429}));};
 try{
  const p=prepareNaturalComposition(createSampleProfile('Fictional'),job),task=requestComposition(p,new AbortController().signal);
  await readyPromise;await new Promise(r=>setImmediate(r));fire();
  await within(a.rejects(task,e=>e.code==='timeout'&&/timed out/i.test(e.message)&&!e.message.includes('offline-fake-key')));
  release();await new Promise(r=>setImmediate(r));a.equal(calls,1);
  const rec=JSON.parse(storage.get('cv-tailor-usage-v1'))[0];a.equal(rec.reason,'timeout');a.equal(rec.status,'failed');a.equal(rec.attempts,1);a(!JSON.stringify(rec).includes('offline-fake-key'));
 }finally{global.fetch=oldFetch;global.setTimeout=oldSet;global.clearTimeout=oldClear;if(oldStorage===undefined)delete global.localStorage;else global.localStorage=oldStorage;}
});

for (const phase of ['fetch','success body']) test(`cancellation settles uncooperative ${phase} and ignores late success`, async () => {
 const oldFetch=global.fetch, oldStorage=global.localStorage; let ready,release,calls=0;
 const readyPromise=new Promise(r=>ready=r),storage=new Map();
 global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const late={candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]};
 global.fetch=()=>{calls++;if(phase==='fetch')return new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify(late),{status:200}));ready();});
  ready();return Promise.resolve({ok:true,json:()=>new Promise(resolve=>{release=()=>resolve(late)})});};
 try { const controller=new AbortController(),p=prepareNaturalComposition(createSampleProfile('Fictional'),job),task=requestComposition(p,controller.signal);
  await readyPromise;await new Promise(r=>setImmediate(r));controller.abort();
  await within(a.rejects(task,e=>e.code==='cancelled'&&/cancelled/i.test(e.message)));
  release();await new Promise(r=>setImmediate(r));a.equal(calls,1);
  const rec=JSON.parse(storage.get('cv-tailor-usage-v1'))[0];a.equal(rec.reason,'cancelled');a.equal(rec.status,'cancelled');a.equal(rec.attempts,1);
 } finally {global.fetch=oldFetch;if(oldStorage===undefined)delete global.localStorage;else global.localStorage=oldStorage;}
});

test('late response after wall deadline stops even if timer was suspended', async () => {
 const oldFetch=global.fetch,oldStorage=global.localStorage,oldNow=Date.now;let release,calls=0,now=1700000000000;
 const storage=new Map();global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};Date.now=()=>now;
 global.fetch=()=>{calls++;return new Promise(resolve=>{release=()=>resolve(new Response('',{status:503}));});};
 try {const p=prepareNaturalComposition(createSampleProfile('Fictional'),job),task=requestComposition(p,new AbortController().signal);
  now+=300001;release();await within(a.rejects(task,e=>e.code==='timeout'));a.equal(calls,1);
  const rec=JSON.parse(storage.get('cv-tailor-usage-v1'))[0];a.equal(rec.reason,'timeout');a.equal(rec.attempts,1);
 } finally {global.fetch=oldFetch;Date.now=oldNow;if(oldStorage===undefined)delete global.localStorage;else global.localStorage=oldStorage;}
});

test('late fetch response body is cancelled and cannot trigger a fallback', async()=>{
 const oldFetch=global.fetch,oldStorage=global.localStorage;let release,cancelled=false,calls=0;const storage=new Map();
 global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 global.fetch=()=>{calls++;return new Promise(r=>release=()=>r(new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:503})));};
 try{const controller=new AbortController(),p=prepareNaturalComposition(createSampleProfile('Fictional'),job),task=requestComposition(p,controller.signal);controller.abort();await within(a.rejects(task,e=>e.code==='cancelled'));release();await new Promise(r=>setImmediate(r));a.equal(cancelled,true);a.equal(calls,1);}
 finally{global.fetch=oldFetch;if(oldStorage===undefined)delete global.localStorage;else global.localStorage=oldStorage;}
});

test('aborted JSON parsing releases a non-cooperative response body', async()=>{
 const oldFetch=global.fetch,oldStorage=global.localStorage;let release,ready,cancelled=false,calls=0;const storage=new Map();
 const readyPromise=new Promise(r=>ready=r);
 global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 global.fetch=()=>{calls++;ready();return Promise.resolve({ok:true,body:{cancel(){cancelled=true;return Promise.resolve();}},json:()=>new Promise(r=>release=()=>r({candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]}))});};
 try{const controller=new AbortController(),p=prepareNaturalComposition(createSampleProfile('Fictional'),job),task=requestComposition(p,controller.signal);await readyPromise;await new Promise(r=>setImmediate(r));controller.abort();await within(a.rejects(task,e=>e.code==='cancelled'));a.equal(cancelled,true);release();await new Promise(r=>setImmediate(r));a.equal(calls,1);}
 finally{global.fetch=oldFetch;if(oldStorage===undefined)delete global.localStorage;else global.localStorage=oldStorage;}
});

for(const phase of ['pending read','oversized body','oversized header']) test(`abort or size limit releases diagnostic stream lock: ${phase}`,async()=>{
 const {providerFailureMessage}=get('services/resumeComposer/providerDiagnostics');let cancelled=false;
 const stream=new ReadableStream({start(c){if(phase==='oversized body')c.enqueue(new Uint8Array(32769));},cancel(){cancelled=true;return new Promise(()=>{});}});
 const response=new Response(stream,{status:429,headers:phase==='oversized header'?{'content-length':'40000'}:{}}),controller=new AbortController();
 const task=providerFailureMessage(response,1,controller.signal);if(phase==='pending read'){await new Promise(r=>setImmediate(r));controller.abort();}
 const result=await within(task);a.match(result,/HTTP 429/);a.equal(cancelled,true);a.equal(stream.locked,false);
});

test('oversized successful response is rejected before parsing the model payload', async()=>{
 const oldFetch=global.fetch,oldStorage=global.localStorage;let calls=0;const storage=new Map();
 global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 global.fetch=()=>{calls++;return Promise.resolve(new Response(new Uint8Array(512*1024+1),{status:200}));};
 try{const task=requestComposition(prepareNaturalComposition(createSampleProfile('Fictional'),job),new AbortController().signal);await within(a.rejects(task,e=>e.code==='invalid'&&/oversized/i.test(e.message)));a.equal(calls,1);}
 finally{global.fetch=oldFetch;if(oldStorage===undefined)delete global.localStorage;else global.localStorage=oldStorage;}
});
