// Real Chromium, fictional data only; never connects to a model or external service.
const {test:base,expect}=require('@playwright/test');
const {load}=require('../helpers/editorial-loader.cjs');
const {createSampleProfile}=load('mock/profile');
const test=base.extend({noNetwork:async({context,baseURL},use)=>{
 const external=[],errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.route('**/*',r=>new URL(r.request().url()).origin===baseURL?r.continue():(external.push(r.request().url()),r.abort()));
 await context.routeWebSocket('**/*',s=>{if(new URL(s.url()).host!==new URL(baseURL).host)external.push(s.url());s.close()});
 await use(); expect(external).toEqual([]); expect(errors).toEqual([]);
}});
async function blank(page){await page.goto('/tests/browser/persistence-blank.html');}
async function seed(page,profile,{hold=false,graph=false}={}){
 await page.evaluate(async({profile,hold,graph})=>{
  const db=await new Promise((ok,no)=>{const r=indexedDB.open('keyval-store',1);r.onupgradeneeded=()=>r.result.createObjectStore('keyval');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
  if(graph){const shared={label:'fictional'};shared.self=shared;profile.future={map:new Map([['item',shared]]),alias:shared};}
  await new Promise((ok,no)=>{const tx=db.transaction('keyval','readwrite'),s=tx.objectStore('keyval');s.put([profile],'cv-tailor-profiles-v2');s.put(profile.profileId,'cv-tailor-active-id-v2');s.put({accentColor:'#2557a7',fontFamily:'sans',fontSize:'medium',lineSpacing:'normal',layoutStyle:'modern'},'cv-tailor-builder-theme-v1');s.put({keep:'untouched'},'unrelated');tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});
  if(hold)window.legacy=db;else db.close();
 },{profile,hold,graph});
}
async function openStorage(page,name='storage') {return page.evaluate(async name=>{const {ProfileStorage}=await import('/src/store/profileStorage.ts');const s=new ProfileStorage();window[name]=s;const v=await s.load();return {name:v[0]?.[0]?.profileName}},name)}
async function inspect(page){return page.evaluate(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('keyval-store');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});const result=await new Promise((ok,no)=>{const tx=db.transaction(['keyval','cv-tailor-canonical-v1'],'readonly'),l=tx.objectStore('keyval'),c=tx.objectStore('cv-tailor-canonical-v1'),p=l.get('cv-tailor-profiles-v2'),u=l.get('unrelated'),record=c.get('workspace');tx.oncomplete=()=>ok({version:db.version,legacy:p.result,unrelated:u.result,canonical:record.result});tx.onabort=()=>no(tx.error)});db.close();return result;});}
const fixture=()=>{const p=createSampleProfile('Fictional migration');Object.assign(p.resumeHeader.data,{name:'Fictional',firstName:'Fictional',lastName:'',email:'',phone:'',location:'',linkedin:'',github:'',portfolio:''});p.headline.data='Fictional role';p.summary.data='Fictional summary';p.experience.data=[];p.projects.data=[];p.education.data=[];p.certifications.data=[];p.skills.data=[];p.documentTheme={accentColor:'#2557a7',fontFamily:'sans',fontSize:'medium',lineSpacing:'normal',layoutStyle:'modern'};p.compositionSnapshot={version:'fictional',secret:'synthetic snapshot'};return p};

test('blocked upgrade explains how to preserve old tab work and continues after close',async({page,context,noNetwork})=>{
 await blank(page);const p=fixture();await seed(page,p,{hold:true});const app=await context.newPage();await app.goto('/');
 await expect(app.getByText('Waiting to open your workspace.')).toBeVisible();await expect(app.getByText(/Save or copy its unsaved edits/)).toBeVisible();
 await page.evaluate(()=>window.legacy.close());await expect(app.getByLabel('Resume document name')).toHaveValue(p.profileName);await expect(app.getByText('Saved in this browser',{exact:true})).toBeVisible();
 await expect(app.getByText(/^WIP storage:/)).toBeVisible();const db=await inspect(page);expect(db.version).toBe(2);expect(db.legacy[0].compositionSnapshot).toEqual(p.compositionSnapshot);expect(db.unrelated).toEqual({keep:'untouched'});
});

test('legacy reopened writes diverge and cannot restore canonical removal; stale new writer conflicts',async({page,context,noNetwork})=>{
 await blank(page);const p=fixture();await seed(page,p);await openStorage(page);const other=await context.newPage();await blank(other);await openStorage(other);
 await page.evaluate(async()=>{const [p,a,t]=await window.storage.load();delete p[0].compositionSnapshot;p[0].compositionSnapshotStatus='removed';await window.storage.save(p,a,t)});
 await other.evaluate(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('keyval-store');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});await new Promise((ok,no)=>{const tx=db.transaction('keyval','readwrite');tx.objectStore('keyval').put([{profileName:'old writer',compositionSnapshot:{secret:'synthetic snapshot'}}],'cv-tailor-profiles-v2');tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});db.close()});
 const stale=await other.evaluate(async()=>{try{await window.storage.save([{profileName:'stale',compositionSnapshot:{secret:'synthetic snapshot'}}],'x',{});return 'saved'}catch(e){return e.name}});expect(stale).toBe('StorageConflictError');
 const db=await inspect(page);expect(db.legacy[0].profileName).toBe('old writer');expect(db.canonical.values[0][0].compositionSnapshot).toBeUndefined();expect(db.canonical.values[0][0].compositionSnapshotStatus).toBe('removed');
});

test('Map, cycles and alias survive migration and later save; topology splits fail closed',async({page,noNetwork})=>{
 await blank(page);await seed(page,fixture(),{graph:true});await openStorage(page);
 const check=await page.evaluate(async()=>{let [p,a,t]=await window.storage.load();const f=p[0].future;const before=f.map instanceof Map&&f.map.get('item')===f.alias&&f.alias.self===f.alias;p[0].profileName='Fictional edit';await window.storage.save(p,a,t);[p,a,t]=await window.storage.load();const g=p[0].future;const after=g.map instanceof Map&&g.map.get('item')===g.alias&&g.alias.self===g.alias;g.alias={label:'split'};let error;try{await window.storage.save(p,a,t)}catch(e){error=e.name}return {before,after,error}});
 expect(check).toEqual({before:true,after:true,error:'StorageGraphError'});const db=await inspect(page);expect(db.canonical.values[0][0].profileName).toBe('Fictional edit');expect(db.legacy[0].profileName).toBe('Fictional migration');
});

test('upgrade put failure rolls back version and store; retry migrates unchanged legacy',async({page,noNetwork})=>{
 await blank(page);const p=fixture();await seed(page,p);const result=await page.evaluate(async()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='cv-tailor-canonical-v1')throw new DOMException('injected quota','QuotaExceededError');return original.apply(this,args)};const {ProfileStorage}=await import('/src/store/profileStorage.ts');let failure;try{await new ProfileStorage().load()}catch(e){failure=e.name}IDBObjectStore.prototype.put=original;const db=await new Promise((ok,no)=>{const r=indexedDB.open('keyval-store',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});const state={version:db.version,stores:[...db.objectStoreNames]};db.close();return {failure,state}});
 expect(result.failure).toBeTruthy();expect(result.state).toEqual({version:1,stores:['keyval']});await openStorage(page);const db=await inspect(page);expect(db.legacy[0].profileName).toBe(p.profileName);expect(db.canonical.values[0][0].profileName).toBe(p.profileName);
});

test('two new writers serialize CAS; quota-like abort rolls back and retry works',async({page,context,noNetwork})=>{
 await blank(page);await seed(page,fixture());await openStorage(page);const b=await context.newPage();await blank(b);await openStorage(b);
 const write=p=>p.evaluate(async()=>{const s=window.storage;try{await s.save([{profileName:'fictional writer'}],'id',{});return 'saved'}catch(e){return e.name}});
 const outcomes=await Promise.all([write(page),write(b)]);expect(outcomes.sort()).toEqual(['StorageConflictError','saved']);
 const fresh=await context.newPage();await blank(fresh);await openStorage(fresh);
 const result=await fresh.evaluate(async()=>{const s=window.storage,[p,a,t]=await s.load(),original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='cv-tailor-canonical-v1')throw new DOMException('injected quota','QuotaExceededError');return original.apply(this,args)};let error;try{await s.save([{profileName:'quota edit'}],a,t)}catch(e){error=e.name}IDBObjectStore.prototype.put=original;const [unchanged]=await s.load();await s.save([{profileName:'retry edit'}],a,t);return {error,unchanged:unchanged[0].profileName}});
 expect(result).toEqual({error:'QuotaExceededError',unchanged:'fictional writer'});expect((await inspect(page)).canonical.values[0][0].profileName).toBe('retry edit');
});

test('unexpected connection upgrade stops saving without reloading unsaved UI work',async({page,context,noNetwork})=>{
 await blank(page);const p=fixture();await seed(page,p);const app=await context.newPage();await app.goto('/');await expect(app.getByText('Saved in this browser',{exact:true})).toBeVisible();
 await app.getByLabel('Resume document name').fill('Fictional unsaved edit');
 await page.evaluate(async()=>{const r=indexedDB.open('keyval-store',3);await new Promise((ok,no)=>{r.onsuccess=()=>{r.result.close();ok()};r.onerror=()=>no(r.error)})});
 await expect(app.getByRole('alert')).toContainText('will not reload automatically');await expect(app.getByLabel('Resume document name')).toHaveValue('Fictional unsaved edit');expect(await app.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});dispatchEvent(e);return e.defaultPrevented})).toBe(true);
});

test('unsupported saved metadata shows a load error, preserving both store copies',async({page,context,noNetwork})=>{
 await blank(page);const p=fixture();await seed(page,p);
 await page.evaluate(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('keyval-store',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});await new Promise((ok,no)=>{const tx=db.transaction('keyval','readwrite'),s=tx.objectStore('keyval'),r=s.get('cv-tailor-profiles-v2');r.onsuccess=()=>{const profiles=r.result;profiles[0].futureBlob=new Blob(['fictional']);s.put(profiles,'cv-tailor-profiles-v2')};tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});db.close()});
 const app=await context.newPage();await app.goto('/');await expect(app.getByRole('heading',{name:'We couldn’t open your workspace.'})).toBeVisible();await expect(app.getByText(/could not be loaded or migrated safely/)).toBeVisible();
 const result=await page.evaluate(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('keyval-store');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});return await new Promise((ok,no)=>{const tx=db.transaction(['keyval','cv-tailor-canonical-v1'],'readonly'),a=tx.objectStore('keyval').get('cv-tailor-profiles-v2'),b=tx.objectStore('cv-tailor-canonical-v1').get('workspace');tx.oncomplete=()=>{const v={legacy:a.result[0].futureBlob instanceof Blob,canonical:b.result.values[0][0].futureBlob instanceof Blob};db.close();ok(v)};tx.onabort=()=>no(tx.error)})});expect(result).toEqual({legacy:true,canonical:true});
});


test('UI stale writer retains edits and refuses lossy JSON for Map/cycles',async({page,context,noNetwork})=>{
 await blank(page);await seed(page,fixture(),{graph:true});const a=await context.newPage(),b=await context.newPage();await a.goto('/');await expect(a.getByText('Saved in this browser',{exact:true})).toBeVisible();await b.goto('/');await expect(b.getByText('Saved in this browser',{exact:true})).toBeVisible();
 await b.evaluate(()=>{const set=window.setTimeout,clear=window.clearTimeout,held=new Map();window.setTimeout=function(fn,ms,...args){if(ms!==450)return set(fn,ms,...args);const id=set(()=>{},60000);held.set(id,()=>fn(...args));return id};window.clearTimeout=function(id){held.delete(id);return clear(id)};window.release=()=>{window.setTimeout=set;window.clearTimeout=clear;for(const [id,fn] of held){clear(id);set(fn,0)}held.clear()}});
 await b.getByLabel('Resume document name').fill('Fictional unsaved name');await a.locator('summary').filter({hasText:'Remove saved generation text comparison'}).click();await expect(a.getByText(/legacy copy remains and may contain this comparison/)).toBeVisible();await a.getByRole('button',{name:'Remove comparison from this copy'}).click();await expect(a.getByText('Saved in this browser',{exact:true})).toBeVisible();
 await b.evaluate(()=>window.release());await expect(b.getByRole('alert')).toContainText('edits are not saved and remain here');await expect(b.getByLabel('Resume document name')).toHaveValue('Fictional unsaved name');await b.getByRole('button',{name:'Download unsaved workspace JSON'}).click();await expect(b.getByText(/Cannot make a lossless JSON copy/)).toBeVisible();
 const state=await inspect(page);expect(state.canonical.values[0][0].compositionSnapshot).toBeUndefined();expect(state.legacy[0].compositionSnapshot).toEqual(fixture().compositionSnapshot);
});

test('aborting migration after a put reports failure and rolls back schema and legacy data',async({page,context,noNetwork})=>{
 await blank(page);const p=fixture();await seed(page,p);const app=await context.newPage();await app.addInitScript(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const result=original.apply(this,args);if(this.name==='cv-tailor-canonical-v1')this.transaction.abort();return result}});await app.goto('/');await expect(app.getByRole('heading',{name:'We couldn’t open your workspace.'})).toBeVisible();await expect(app.getByText(/could not be loaded or migrated safely/)).toBeVisible();
 const result=await page.evaluate(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('keyval-store',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});return await new Promise((ok,no)=>{const tx=db.transaction('keyval','readonly'),r=tx.objectStore('keyval').get('cv-tailor-profiles-v2');tx.oncomplete=()=>{const out={version:db.version,stores:[...db.objectStoreNames],profile:r.result[0].profileName};db.close();ok(out)};tx.onabort=()=>no(tx.error)})});expect(result).toEqual({version:1,stores:['keyval'],profile:p.profileName});
});


test('profile-root cycle split by UI edit fails visibly without overwriting either store',async({page,context,noNetwork})=>{
 await blank(page);await seed(page,fixture());await page.evaluate(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('keyval-store',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});await new Promise((ok,no)=>{const tx=db.transaction('keyval','readwrite'),s=tx.objectStore('keyval'),r=s.get('cv-tailor-profiles-v2');r.onsuccess=()=>{const profiles=r.result;profiles[0].futureSelf=profiles[0];s.put(profiles,'cv-tailor-profiles-v2')};tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});db.close()});
 const app=await context.newPage();await app.goto('/');await expect(app.getByText('Saved in this browser',{exact:true})).toBeVisible();await app.getByLabel('Resume document name').fill('Fictional unsaved edit');await expect(app.getByRole('alert')).toContainText('unsupported or shared data relationships');await expect(app.getByLabel('Resume document name')).toHaveValue('Fictional unsaved edit');
 const state=await page.evaluate(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('keyval-store');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});return await new Promise((ok,no)=>{const tx=db.transaction(['keyval','cv-tailor-canonical-v1'],'readonly'),a=tx.objectStore('keyval').get('cv-tailor-profiles-v2'),b=tx.objectStore('cv-tailor-canonical-v1').get('workspace');tx.oncomplete=()=>{const l=a.result[0],c=b.result.values[0][0];const result={legacy:l.futureSelf===l,canonical:c.futureSelf===c};db.close();ok(result)};tx.onabort=()=>no(tx.error)})});expect(state).toEqual({legacy:true,canonical:true});
});


test('shared graphs reject ambiguous structural changes without overwriting',async({page,noNetwork})=>{
 await blank(page);await seed(page,fixture(),{graph:true});await openStorage(page);
 const error=await page.evaluate(async()=>{const [p,a,t]=await window.storage.load();p[0].skills.data.push({id:'fictional-item',name:'fictional'});try{await window.storage.save(p,a,t);return 'saved'}catch(e){return e.name}});expect(error).toBe('StorageGraphError');expect((await inspect(page)).canonical.values[0][0].skills.data).toEqual([]);
});

test('versionchange during an active save cannot be cleared by its later completion',async({page,context,noNetwork})=>{
 await blank(page);await seed(page,fixture());const app=await context.newPage();await app.goto('/');await expect(app.getByText('Saved in this browser',{exact:true})).toBeVisible();
 // Keep the actual canonical readwrite transaction active, without delaying the
 // versionchange event or replacing the app's transaction handlers.
 await app.evaluate(()=>{
  const original=IDBObjectStore.prototype.put;
  window.releaseActiveSave=false;window.activeSaveStarted=false;window.activeSaveCompleted=false;
  IDBObjectStore.prototype.put=function(...args){
   const result=original.apply(this,args);
   if(this.name==='cv-tailor-canonical-v1'){
    const store=this,tx=this.transaction;
    IDBObjectStore.prototype.put=original;
    tx.addEventListener('complete',()=>{window.activeSaveCompleted=true});
    window.activeSaveStarted=true;
    const keepAlive=()=>{if(window.releaseActiveSave)return;const request=store.get('workspace');request.onsuccess=keepAlive};
    keepAlive();
   }
   return result;
  };
 });
 await app.getByLabel('Resume document name').fill('Fictional first edit');
 await expect.poll(()=>app.evaluate(()=>window.activeSaveStarted)).toBe(true);
 await page.evaluate(()=>{window.upgradeState='pending';const request=indexedDB.open('keyval-store',3);request.onsuccess=()=>{request.result.close();window.upgradeState='complete'};request.onerror=()=>{window.upgradeState='error'}});
 await expect(app.getByRole('alert')).toContainText('will not reload automatically');
 expect(await app.evaluate(()=>window.activeSaveCompleted)).toBe(false);
 await app.evaluate(()=>{window.releaseActiveSave=true});
 await expect.poll(()=>app.evaluate(()=>window.activeSaveCompleted)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>window.upgradeState)).toBe('complete');
 // Allow the save promise continuation and React state update to run.
 await app.waitForTimeout(250);
 await expect(app.getByText('Not saved',{exact:true})).toBeVisible();
 await expect(app.getByRole('alert')).toContainText('will not reload automatically');
 await app.getByLabel('Resume document name').fill('Fictional later unsaved edit');
 await app.waitForTimeout(700);
 await expect(app.getByText('Not saved',{exact:true})).toBeVisible();
 await expect(app.getByLabel('Resume document name')).toHaveValue('Fictional later unsaved edit');
 expect(await app.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});dispatchEvent(e);return e.defaultPrevented})).toBe(true);
 expect((await inspect(page)).canonical.values[0][0].profileName).toBe('Fictional first edit');
});
