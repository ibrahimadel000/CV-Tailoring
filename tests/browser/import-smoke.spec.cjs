const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const fixtures=require('./import-fixtures.cjs');
const files={pdf:()=>({name:'fictional.pdf',mimeType:'application/pdf',buffer:fixtures.simplePdf()}),docx:()=>({name:'fictional.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:fixtures.simpleDocx()})};
async function stored(page){return page.evaluate(async()=>{const req=indexedDB.open('keyval-store',1);const db=await new Promise((a,b)=>{req.onsuccess=()=>a(req.result);req.onerror=()=>b(req.error)});const store=db.transaction('keyval','readonly').objectStore('keyval');const read=k=>new Promise((a,b)=>{const r=store.get(k);r.onsuccess=()=>a(r.result);r.onerror=()=>b(r.error)});const profiles=await read('cv-tailor-profiles-v2'),active=await read('cv-tailor-active-id-v2');db.close();return{profiles,active}})}
async function start(page,context){await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:4187'?r.continue():r.abort());await page.goto('/');await expect(page.getByText('Saved in this browser',{exact:true})).toBeVisible()}
async function openImport(page){await page.getByRole('button',{name:'Import CV'}).first().click()}
for(const format of ['pdf','docx'])test(`fictional ${format} import, edit, reload, and PDF`,async({page,context},testInfo)=>{
 await start(page,context);const before=await stored(page);await openImport(page);await page.getByLabel('Choose CV file').setInputFiles(files[format]());
 await expect(page.getByRole('dialog',{name:'Import your resume'})).not.toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(before.profiles.length+1);
 let state=await stored(page),p=state.profiles.find(x=>x.profileId===state.active);const id=p.profileId;
 for(const old of before.profiles)expect(state.profiles.find(x=>x.profileId===old.profileId)).toEqual(old);
 expect(p.resumeHeader.data.name).toBe('Maya Vale');expect(p.resumeHeader.data.email).toBe('maya@example.invalid');
 expect(p.experience.data[0]).toMatchObject({roleTitle:'Software Engineer Intern',companyName:'Example Systems',startDate:'Jan 2024',endDate:'Jun 2024'});
 expect(p.experience.data[0].bullets.map(b=>b.text)).toEqual(['Built Python APIs for a classroom exercise, not production.','Recorded manual testing results.']);
 expect(p.education.data[0]).toMatchObject({degree:'BSc Computer Science (in progress)',institution:'Example University',graduationDate:'Expected 2027'});
 expect(p.skills.data.map(s=>s.name)).toEqual(['Python (coursework only)','SQL (beginner)']);
 expect(p.importedFrom.sourceText).toContain('not production');
 const toggle=page.locator('[data-section-card="summary"] .section-accordion-toggle');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
 await page.getByLabel('Your professional summary',{exact:true}).fill('Junior developer with classroom API experience and manual verification.');
 await expect.poll(async()=>(await stored(page)).profiles.find(x=>x.profileId===id)?.summary.data).toBe('Junior developer with classroom API experience and manual verification.');
 await expect(page.getByText('Saved in this browser',{exact:true})).toBeVisible();await page.reload();await expect(page.getByText('Saved in this browser',{exact:true})).toBeVisible();
 state=await stored(page);p=state.profiles.find(x=>x.profileId===id);expect(p.summary.data).toBe('Junior developer with classroom API experience and manual verification.');
 await page.getByRole('button',{name:'Export PDF',exact:true}).click();const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF',exact:true}).click();const download=await promise;
 await download.saveAs(testInfo.outputPath('imported-fictional.pdf'));const bytes=await fs.readFile(testInfo.outputPath('imported-fictional.pdf'));expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
 const text=await page.evaluate(async bytes=>{const pdf=await import('/node_modules/pdfjs-dist/build/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/build/pdf.worker.mjs';const doc=await pdf.getDocument({data:Uint8Array.from(bytes)}).promise;const out=[];for(let i=1;i<=doc.numPages;i++)out.push((await(await doc.getPage(i)).getTextContent()).items.map(x=>x.str??'').join(' '));await doc.destroy();return out.join(' ').replace(/\s+/g,' ')},Array.from(bytes));
 for(const content of ['Maya Vale','Junior developer with classroom API experience and manual verification.','Example Systems','not production','BSc Computer Science (in progress)','Expected 2027','coursework only','beginner'])expect(text).toContain(content);
});
test('image-only PDF is rejected without changing stored resumes',async({page,context})=>{await start(page,context);const before=await stored(page);await openImport(page);await page.getByLabel('Choose CV file').setInputFiles({name:'scanned.pdf',mimeType:'application/pdf',buffer:fixtures.scannedPdf()});await expect(page.getByRole('alert')).toContainText('Scanned/image-only PDFs need OCR');expect(await stored(page)).toEqual(before)});
test('multipage PDF import retains page-spanning bullets and exports all pages',async({page,context},testInfo)=>{
 await start(page,context);await openImport(page);await page.getByLabel('Choose CV file').setInputFiles({name:'multipage.pdf',mimeType:'application/pdf',buffer:fixtures.multiPdf()});
 await expect(page.getByRole('dialog',{name:'Import your resume'})).not.toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.some(p=>p.importedFrom?.fileName==='multipage.pdf')).toBe(true);
 const state=await stored(page),p=state.profiles.find(x=>x.profileId===state.active);
 expect(p.importedFrom.pages).toBe(2);expect(p.experience.data).toHaveLength(1);
 expect(p.experience.data[0].bullets).toHaveLength(30);
 for(let i=1;i<=30;i++)expect(p.experience.data[0].bullets[i-1].text).toContain(`Classroom task ${String(i).padStart(2,'0')}`);
 expect(p.education.data[0].degree).toBe('BSc Computer Science (in progress)');
 await page.getByRole('button',{name:'Export PDF',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF',exact:true}).click();const download=await pending;await download.saveAs(testInfo.outputPath('multipage.pdf'));
 const bytes=await fs.readFile(testInfo.outputPath('multipage.pdf'));
 const out=await page.evaluate(async bytes=>{const pdf=await import('/node_modules/pdfjs-dist/build/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/build/pdf.worker.mjs';const doc=await pdf.getDocument({data:Uint8Array.from(bytes)}).promise;const text=[],counts=[],outside=[];for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),view=p.getViewport({scale:1}),items=(await p.getTextContent()).items.filter(x=>typeof x.str==='string'&&x.str.trim());counts.push(items.length);text.push(items.map(x=>x.str).join(' '));outside.push(items.filter(x=>x.transform[4]<-1||x.transform[5]<-1||x.transform[4]+x.width>view.width+1||x.transform[5]+x.height>view.height+1).length)}const n=doc.numPages;await doc.destroy();return {n,counts,outside,text:text.join(' ').replace(/\s+/g,' ')}},Array.from(bytes));
 expect(out.n).toBeGreaterThan(1);expect(out.counts.every(n=>n>0)).toBe(true);expect(out.outside.every(n=>n===0)).toBe(true);for(let i=1;i<=30;i++)expect(out.text).toContain(`Classroom task ${String(i).padStart(2,'0')}`);
 expect(out.text).toContain('in progress');expect(out.text).toContain('Expected 2027');
});
