// Local-only: route every non-test-server request to an abort.
const {test:base,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const {load}=require('../helpers/editorial-loader.cjs');
const {createSampleProfile}=load('mock/profile');
const P='cv-tailor-profiles-v2',A='cv-tailor-active-id-v2';
const snapshot={version:'professional-comparison-v1',source:{summary:'private source',experience:[],projects:[]},generated:{summary:'private generated',experience:[],projects:[]}};
const changes={summary:'changed',experience:'empty',projects:'empty',skills:{retained:0,excluded:[],added:0,reordered:false,regrouped:false}};
const test=base.extend({noNetwork:async({context,baseURL},use)=>{
 const escaped=[],errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));for(const p of context.pages())p.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>{if(new URL(r.request().url()).origin===baseURL)return r.continue();escaped.push(r.request().url());return r.abort();});
 await context.routeWebSocket('**/*',s=>{if(new URL(s.url()).host!==new URL(baseURL).host)escaped.push(s.url());s.close();});await use();expect(escaped).toEqual([]);expect(errors).toEqual([]);
}});
async function saved(p){await expect(p.getByText('Saved in this browser',{exact:true})).toBeVisible();}
async function read(p){return p.evaluate(async({P,A})=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('keyval-store');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});return await new Promise((ok,no)=>{const tx=db.transaction('keyval','readonly'),s=tx.objectStore('keyval'),p=s.get(P),a=s.get(A);tx.oncomplete=()=>{db.close();ok({profiles:p.result,active:a.result})};tx.onabort=()=>no(tx.error)});},{P,A});}
async function write(p,profiles,id){await p.evaluate(async({P,A,profiles,id})=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('keyval-store');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});await new Promise((ok,no)=>{const tx=db.transaction('keyval','readwrite'),s=tx.objectStore('keyval');s.put(profiles,P);s.put(id,A);tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});db.close();},{P,A,profiles,id});}
async function seed(p,{withChanges=true,snap=snapshot}={}){
 await p.goto('/');await saved(p);const x=createSampleProfile('Conflict fixture');x.compositionSnapshot=snap;if(withChanges)x.compositionChanges=changes;
 await write(p,[x],x.profileId);await p.reload();await saved(p);return x;
}
async function hold(p){await p.evaluate(()=>{const oldSet=window.setTimeout,oldClear=window.clearTimeout,held=new Map();window.setTimeout=function(fn,ms,...args){if(ms!==450)return oldSet(fn,ms,...args);const id=oldSet(()=>{},60000);held.set(id,()=>fn(...args));return id};window.clearTimeout=function(id){held.delete(id);return oldClear(id)};window.releaseHeldSaves=()=>{window.setTimeout=oldSet;window.clearTimeout=oldClear;for(const [id,fn] of held){oldClear(id);oldSet(fn,0)}held.clear()};});}
async function release(p){await p.evaluate(()=>window.releaseHeldSaves());}
async function remove(p){await p.locator('summary').filter({hasText:'Remove saved generation text comparison'}).click();await expect(p.getByText(/An older version left open can restore/)).toBeVisible();await p.getByRole('button',{name:'Remove comparison from this copy'}).click();}
async function warning(p){await expect(p.getByText('Not saved',{exact:true})).toBeVisible();await expect(p.getByRole('alert')).toContainText('This tab’s edits are not saved and remain here');}
async function unloadBlocked(p){return p.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});}

test('two tabs: stale edits cannot restore a removed comparison; local work stays visible and exportable',async({page,context,noNetwork})=>{
 await seed(page);const b=await context.newPage();await b.goto('/');await saved(b);await hold(b);
 await b.getByLabel('Resume document name').fill('Unsaved work in tab B');expect(await unloadBlocked(b)).toBe(true);
 await remove(page);await saved(page);expect((await read(page)).profiles[0].compositionSnapshot).toBeUndefined();
 await release(b);await warning(b);await expect(b.getByLabel('Resume document name')).toHaveValue('Unsaved work in tab B');
 expect(await unloadBlocked(b)).toBe(true);await b.getByLabel('Resume document name').fill('More unsaved work');await b.waitForTimeout(700);
 await warning(b);expect((await read(page)).profiles[0].profileName).toBe('Conflict fixture');expect((await read(page)).profiles[0].compositionSnapshot).toBeUndefined();
 const downloadPromise=b.waitForEvent('download');await b.getByRole('button',{name:'Download unsaved workspace JSON'}).click();const download=await downloadPromise;
 const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));expect(backup.profiles[0].profileName).toBe('More unsaved work');expect(backup.profiles[0].compositionSnapshot).toEqual(snapshot);
 const fresh=await context.newPage();await fresh.goto('/');await saved(fresh);await expect(fresh.getByLabel('Resume document name')).toHaveValue('Conflict fixture');
});

test('two tabs: conflicting removal is visibly unsaved and cannot discard the other edit',async({page,context,noNetwork})=>{
 await seed(page);const b=await context.newPage();await b.goto('/');await saved(b);await hold(b);await remove(b);
 await page.getByLabel('Resume document name').fill('Saved by A');await saved(page);await release(b);await warning(b);
 const db=await read(page);expect(db.profiles[0].profileName).toBe('Saved by A');expect(db.profiles[0].compositionSnapshot).toEqual(snapshot);
 await expect(b.getByText('The saved generation text comparison was removed from this copy.')).toBeVisible();expect(await unloadBlocked(b)).toBe(true);
});

test('simultaneous saves have one winner and the losing tab retains its edit',async({page,context,noNetwork})=>{
 await seed(page);const b=await context.newPage();await b.goto('/');await saved(b);await Promise.all([hold(page),hold(b)]);
 await page.getByLabel('Resume document name').fill('Tab A value');await b.getByLabel('Resume document name').fill('Tab B value');
 await Promise.all([release(page),release(b)]);
 await expect.poll(async()=>[await page.getByText('Not saved',{exact:true}).count(),await b.getByText('Not saved',{exact:true}).count()]).toEqual(expect.arrayContaining([1,0]));
 const aLost=await page.getByText('Not saved',{exact:true}).isVisible();const loser=aLost?page:b,winner=aLost?b:page;
 await warning(loser);await saved(winner);await expect(loser.getByLabel('Resume document name')).toHaveValue(aLost?'Tab A value':'Tab B value');
 expect((await read(page)).profiles[0].profileName).toBe(aLost?'Tab B value':'Tab A value');expect(await unloadBlocked(loser)).toBe(true);
});

test('revisionless external write is detected before any overwrite',async({page,noNetwork})=>{
 const p=await seed(page);await hold(page);await page.getByLabel('Resume document name').fill('Local unsaved');
 await write(page,[{...p,profileName:'External update'}],p.profileId);await release(page);await warning(page);
 expect((await read(page)).profiles[0].profileName).toBe('External update');await expect(page.getByLabel('Resume document name')).toHaveValue('Local unsaved');
});

test('malformed and valid snapshots without change summaries remain removable; status survives reload',async({page,noNetwork})=>{
 for(const snap of [{version:'future-v99',secret:'keep until removed'},null,snapshot]){
  await seed(page,{withChanges:false,snap});
  if(snap!==snapshot)await expect(page.getByText(/unsupported or damaged/)).toBeVisible();else await expect(page.locator('summary').filter({hasText:'Compare at generation'})).toBeVisible();
  await page.locator('summary').filter({hasText:'Remove saved generation text comparison'}).click();await page.getByRole('button',{name:'Remove comparison from this copy'}).click();await saved(page);
  const p=(await read(page)).profiles[0];expect(p.compositionSnapshot).toBeUndefined();expect(p.compositionSnapshotStatus).toBe('removed');expect(p.compositionChanges).toBeUndefined();
  await page.reload();await saved(page);await expect(page.getByText('The saved generation text comparison was removed from this copy.')).toBeVisible();
 }
});

test('synchronous put failure is atomic and retry saves the removal',async({page,noNetwork})=>{
 await seed(page);await page.locator('summary').filter({hasText:'Remove saved generation text comparison'}).click();
 await page.evaluate(()=>{window.oldPut=IDBObjectStore.prototype.put;let n=0;IDBObjectStore.prototype.put=function(...args){if(++n===2)throw new DOMException('quota','QuotaExceededError');return window.oldPut.apply(this,args)}});
 await page.getByRole('button',{name:'Remove comparison from this copy'}).click();await expect(page.getByText(/Could not save in this browser/)).toBeVisible();expect((await read(page)).profiles[0].compositionSnapshot).toEqual(snapshot);expect(await unloadBlocked(page)).toBe(true);
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.oldPut});await page.getByRole('button',{name:'Retry',exact:true}).click();await saved(page);expect((await read(page)).profiles[0].compositionSnapshot).toBeUndefined();expect(await unloadBlocked(page)).toBe(false);
});
