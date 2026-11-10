// Fully mocked transport using an inert, deliberately non-synthetic key string.
// No environment credentials, provider requests, or private CVs are used.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(root);const normal=m.require.bind(m);m.require=id=>id.startsWith('@/')?load(path.join(root,'src',id.slice(2)+'.ts')):id.startsWith('.')&&fs.existsSync(path.resolve(path.dirname(file),id+'.ts'))?load(path.resolve(path.dirname(file),id+'.ts')):normal(id);cache.set(file,m);const source=fs.readFileSync(file,'utf8').replaceAll('import.meta.env.DEV','true').replaceAll('import.meta.env.VITE_GEMINI_API_KEY',"'offline-fake-key-not-a-credential'");m._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);return m.exports;}
const get=p=>load(path.join(root,'src',p+'.ts'));
const {requestComposition,liveCompositionCandidates}=get('services/resumeComposer/request'),{prepareNaturalComposition}=get('services/resumeComposer/naturalDocument'),{createSampleProfile}=get('mock/profile'),{readLatestTailorUsage}=get('services/tailorRequest');
const job='Fictional data specialist: organize library records and collaborate on documentation.';
function packet(){return prepareNaturalComposition(createSampleProfile('Fictional offline test'),job)}
function complete(total){return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}],usageMetadata:{totalTokenCount:total}}),{status:200})}
function incomplete(total){return new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS'}],usageMetadata:{totalTokenCount:total}}),{status:200})}
async function mock(responses,model='gemini-3.5-flash-lite'){
 const oldFetch=global.fetch,oldStorage=global.localStorage,storage=new Map(),calls=[],bodies=[];
 global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 global.fetch=async (url,options)=>{calls.push(String(url));bodies.push(JSON.parse(options.body));assert(responses.length,'unexpected extra fetch');const next=responses.shift();if(next instanceof Error)throw next;return next};
 try{let result,error;try{result=await requestComposition(packet(),new AbortController().signal,model)}catch(e){error=e}return {result,error,calls,bodies,usage:readLatestTailorUsage(),raw:JSON.stringify([...storage.values()])}}
 finally{global.fetch=oldFetch;if(oldStorage===undefined)delete global.localStorage;else global.localStorage=oldStorage;}
}
test('live fallback order is bounded, starts with selection and avoids duplicates',()=>{
 assert.deepEqual(liveCompositionCandidates('gemini-3.5-flash-lite'),['gemini-3.5-flash-lite','gemini-3.6-flash','gemini-3.5-flash']);
 assert.deepEqual(liveCompositionCandidates('gemini-3-flash-preview'),['gemini-3-flash-preview','gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite']);
});
test('503 fallback records selected and actual model without private content',async()=>{
 const x=await mock([new Response('',{status:503}),complete(12)]);assert.equal(x.error,undefined);assert.deepEqual(x.result,{});assert.equal(x.calls.length,2);
 assert.equal(x.usage.model,'gemini-3.5-flash-lite');assert.equal(x.usage.lastModel,'gemini-3.6-flash');assert.equal(x.usage.attempts,2);assert.equal(x.usage.total,12);assert(!x.raw.includes(job));assert(!x.raw.includes('offline-fake-key'));
 assert.deepEqual(x.bodies[0].contents,x.bodies[1].contents);assert.deepEqual(x.bodies[0].systemInstruction,x.bodies[1].systemInstruction);
 assert.equal(x.bodies[0].generationConfig.maxOutputTokens,16384);assert.equal(x.bodies[0].generationConfig.thinkingConfig.thinkingLevel,'medium');assert.equal(x.bodies[1].generationConfig.maxOutputTokens,24576);assert.equal(x.bodies[1].generationConfig.thinkingConfig.thinkingLevel,'low');
});
test('incomplete response still falls back; usage is the last provider response only',async()=>{
 const x=await mock([incomplete(100),complete(12)]);assert.equal(x.calls.length,2);assert.equal(x.usage.total,12);assert.equal(x.usage.lastModel,'gemini-3.6-flash');
});
test('after fallback a provider failure reports the number of requests and no further retry',async()=>{
 const x=await mock([new Response('',{status:503}),new Response('',{status:429})]);assert.equal(x.calls.length,2);assert.match(x.error.message,/2 model requests/);assert.match(x.error.message,/No further automatic retry/);assert.equal(x.usage.lastModel,'gemini-3.6-flash');assert.equal(x.usage.status,'failed');
});
test('one-request failure retains existing diagnostic wording',async()=>{
 const x=await mock([new Response('',{status:429})]);assert.equal(x.calls.length,1);assert.match(x.error.message,/No automatic retry/);assert.equal(x.usage.lastModel,'gemini-3.5-flash-lite');
});

test('last request without usage never mislabels earlier token counts as latest',async()=>{
 const x=await mock([incomplete(100),new Response('',{status:429})]);assert.equal(x.calls.length,2);assert.equal(x.usage.total,undefined);assert.equal(x.usage.lastModel,'gemini-3.6-flash');
});
test('fallback exhaustion stops at the disclosed four attempts',async()=>{
 const x=await mock(Array.from({length:4},()=>new Response('',{status:503})),'gemini-3-flash-preview');assert.equal(x.calls.length,4);assert.match(x.error.message,/4 model requests/);assert.equal(x.usage.attempts,4);assert.equal(x.usage.lastModel,'gemini-3.5-flash-lite');
});

test('network failure stops immediately rather than silently falling back',async()=>{
 const x=await mock([new Error('fictional network error')]);assert.equal(x.calls.length,1);assert.equal(x.usage.attempts,1);assert.equal(x.usage.status,'failed');assert.match(x.error.message,/No automatic retry/);
});

function candidateReason(reason, extra={}){return new Response(JSON.stringify({candidates:[{finishReason:reason,finishMessage:'PRIVATE_PROVIDER_MESSAGE',content:{parts:[{text:'PRIVATE_PARTIAL_OUTPUT'}]}}],...extra}),{status:200})}
for(const reason of ['SAFETY','RECITATION','BLOCKLIST','PROHIBITED_CONTENT','SPII','LANGUAGE','IMAGE_SAFETY']){
 test('provider restriction '+reason+' stops without trying another model',async()=>{
  const x=await mock([candidateReason(reason),complete(10)]);assert.equal(x.calls.length,1);assert.equal(x.result,undefined);assert.equal(x.error.code,'blocked');assert(!x.error.message.includes('PRIVATE_PROVIDER_MESSAGE'));assert(!x.error.message.includes('PRIVATE_PARTIAL_OUTPUT'));assert.equal(x.usage.status,'failed');
 });
}
for(const reason of ['SAFETY','OTHER','BLOCKLIST','PROHIBITED_CONTENT','UNKNOWN_PRIVATE_REASON']){
 test('prompt block '+reason+' prevents fallback and never exposes raw reason',async()=>{
  const x=await mock([new Response(JSON.stringify({promptFeedback:{blockReason:reason,blockReasonMessage:'PRIVATE_PROVIDER_MESSAGE'}}),{status:200}),complete(10)]);assert.equal(x.calls.length,1);assert.equal(x.result,undefined);assert.equal(x.error.code,'blocked');assert(!x.error.message.includes('PRIVATE_PROVIDER_MESSAGE'));assert(!x.error.message.includes('UNKNOWN_PRIVATE_REASON'));
 });
}
test('a prompt block takes precedence even with an inconsistent MAX_TOKENS candidate',async()=>{
 const x=await mock([candidateReason('MAX_TOKENS',{promptFeedback:{blockReason:'SAFETY'}}),complete(10)]);assert.equal(x.calls.length,1);assert.equal(x.error.code,'blocked');
});
test('a prompt block takes precedence even with an inconsistent STOP candidate',async()=>{
 const body={promptFeedback:{blockReason:'SAFETY'},candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]};const x=await mock([new Response(JSON.stringify(body),{status:200})]);assert.equal(x.calls.length,1);assert.equal(x.result,undefined);assert.equal(x.error.code,'blocked');
});
for(const body of [{},{candidates:[]},{candidates:[{}]},{candidates:[{finishReason:'OTHER'}]},{candidates:[{finishReason:'MAX_TOKENS'},{finishReason:'OTHER'}]}]){
 test('unknown or malformed response stops rather than switching models',async()=>{
  const x=await mock([new Response(JSON.stringify(body),{status:200}),complete(10)]);assert.equal(x.calls.length,1);assert.equal(x.error.code,'incomplete');assert.equal(x.result,undefined);
 });
}
test('a restriction after a 503 stops the sequence and records both attempts',async()=>{
 const x=await mock([new Response('',{status:503}),candidateReason('SAFETY'),complete(10)]);assert.equal(x.calls.length,2);assert.equal(x.error.code,'blocked');assert.equal(x.usage.attempts,2);assert.equal(x.usage.lastModel,'gemini-3.6-flash');assert.match(x.error.message,/No further automatic retry/);
});

test('blocked safety ratings take precedence over an otherwise successful candidate',async()=>{
 const body={candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]},safetyRatings:[{blocked:true}]}]};const x=await mock([new Response(JSON.stringify(body),{status:200})]);assert.equal(x.calls.length,1);assert.equal(x.error.code,'blocked');assert.equal(x.result,undefined);
});
test('a restricted candidate among inconsistent multiple candidates prevents fallback',async()=>{
 const body={candidates:[{finishReason:'MAX_TOKENS'},{finishReason:'SAFETY'}]};const x=await mock([new Response(JSON.stringify(body),{status:200}),complete(10)]);assert.equal(x.calls.length,1);assert.equal(x.error.code,'blocked');
});
test('nonblocked safety ratings do not prevent an ordinary successful response',async()=>{
 const body={candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]},safetyRatings:[{blocked:false}]}]};const x=await mock([new Response(JSON.stringify(body),{status:200})]);assert.equal(x.error,undefined);assert.deepEqual(x.result,{});
});
