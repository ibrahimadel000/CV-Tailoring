// Deterministic, offline IDB-transaction model. Real IndexedDB is covered in browser tests.
const {test}=require('node:test'), assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {ProfileStorage,StorageConflictError,sameStoredValue}=load('store/profileStorage');
function database(initial={}) {
 const data=new Map(Object.entries(initial)); let tail=Promise.resolve(), failPut=0;
 function store(mode,callback){
  const run=tail.then(()=>new Promise((resolve,reject)=>{
   const draft=new Map([...data].map(([k,v])=>[k,structuredClone(v)]));
   let pending=0,aborted=false,puts=0, callbackPromise;
   const tx={error:null,abort(){aborted=true;queueMicrotask(()=>tx.onabort?.());}};
   const objectStore={transaction:tx,get(key){
    const req={result:undefined};pending++;
    queueMicrotask(()=>{ if(aborted)return;req.result=structuredClone(draft.get(key));req.onsuccess?.();if(--pending===0&&!aborted)queueMicrotask(()=>{
     if(aborted)return;if(mode==='readwrite'){data.clear();for(const [k,v] of draft)data.set(k,structuredClone(v));}tx.oncomplete?.();
    });});return req;
   },put(value,key){if(failPut && ++puts===failPut){failPut=0;throw new Error('injected put failure');}draft.set(key,structuredClone(value));}};
   try {callbackPromise=callback(objectStore);Promise.resolve(callbackPromise).then(resolve,reject);}catch(e){reject(e);}
  }));tail=run.catch(()=>{});return run;
 }
 return {store,data,fail(n){failPut=n}};
}
const P='cv-tailor-profiles-v2', A='cv-tailor-active-id-v2', T='cv-tailor-builder-theme-v1', R='cv-tailor-revision-v1';
const entry={profileId:'one',compositionSnapshot:{source:'private comparison'},summary:'original'};
const initial=()=>({[P]:[entry],[A]:'one',[T]:{font:'sans'}});
test('one transactional winner; stale tab cannot restore removed comparison or erase other edits',async()=>{
 const db=database(initial()),a=new ProfileStorage(db.store),b=new ProfileStorage(db.store);await Promise.all([a.load(),b.load()]);
 const removed={...entry};delete removed.compositionSnapshot;removed.compositionSnapshotStatus='removed';
 await a.save([removed],'one',{font:'sans'});
 await assert.rejects(b.save([{...entry,summary:'unsaved in B'}],'one',{font:'sans'}),StorageConflictError);
 assert.deepEqual(db.data.get(P),[removed]);assert.equal(typeof db.data.get(R),'string');
});
test('simultaneous first writes produce one winner, including a revisionless database',async()=>{
 const db=database(initial()),a=new ProfileStorage(db.store),b=new ProfileStorage(db.store);await Promise.all([a.load(),b.load()]);
 const outcomes=await Promise.allSettled([a.save([{...entry,summary:'A'}],'one',{}),b.save([{...entry,summary:'B'}],'one',{})]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert(outcomes.find(x=>x.status==='rejected').reason instanceof StorageConflictError);
});
test('unversioned outside modifications are detected even when revision is unchanged',async()=>{
 const db=database(initial()),a=new ProfileStorage(db.store);await a.load();db.data.set(P,[{...entry,summary:'external'}]);
 await assert.rejects(a.save([entry],'one',{}),StorageConflictError);assert.equal(db.data.get(P)[0].summary,'external');
});
test('synchronous partial write failure aborts all keys and can be retried',async()=>{
 const db=database(initial()),a=new ProfileStorage(db.store);await a.load();db.fail(2);
 await assert.rejects(a.save([{...entry,summary:'new'}],'changed',{}),/injected/);
 assert.deepEqual(db.data.get(P),[entry]);assert.equal(db.data.get(A),'one');assert.equal(db.data.has(R),false);
 await a.save([{...entry,summary:'new'}],'changed',{});assert.equal(db.data.get(P)[0].summary,'new');assert.equal(db.data.get(A),'changed');
});
test('same-tab queued saves capture each input and serialize their baselines',async()=>{
 const db=database(initial()),a=new ProfileStorage(db.store);await a.load();const first=[{...entry,summary:'first'}];
 const p=a.save(first,'one',{});first[0].summary='mutated';const q=a.save([{...entry,summary:'second'}],'one',{});
 await Promise.all([p,q]);assert.equal(db.data.get(P)[0].summary,'second');
});
test('comparison does not discard undefined, holes, non-JSON types or unknown metadata',()=>{
 assert(!sameStoredValue({x:undefined},{}));assert(!sameStoredValue(Array(2),Array(1)));assert(!sameStoredValue({x:NaN},{x:null}));
 assert(sameStoredValue({x:new Uint8Array([1,2])},{x:new Uint8Array([1,2])}));
 assert(!sameStoredValue({x:new Map([['a',1]])},{x:new Map([['a',1]])}));
 const a={};a.self=a;const b={};b.self=b;assert(sameStoredValue(a,b));
});
