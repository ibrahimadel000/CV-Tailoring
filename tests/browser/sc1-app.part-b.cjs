const { test, expect, fs, createSampleProfile, ORIGIN, PROVIDER_URL, JOB, NARRATIVE_SUMMARY, GENERATED_SUMMARY, EDITED_SUMMARY, ERROR_503, PROFILE_KEY, ACTIVE_KEY, sourceProfile, authoredDocument, completed, stored, saved, seed, acceptProviderConsent, tailor, checkWire, checkPreserved, exportedText } = require('./sc1-app.shared.cjs');
test('appended wording review survives save and reload without claiming verification', async ({ page, sc1Harness }, testInfo) => {
  const p = sourceProfile(true);
  const source = 'Documented API behavior for the developer team.';
  const proposed = 'Documented API behavior for the developer team and deployed the APIs.';
  p.experience.data[0].bullets[0].text = source;
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.entries[0].bullets[0].text = proposed;
    return { body: completed(document) };
  });
  const original = await seed(page, p); await tailor(page); await saved(page);
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/compare the added wording in this bullet/).first()).toBeVisible();
  // The banner can render before IndexedDB catches up with the active copy.
  await expect.poll(async () => {
    const state = await stored(page);
    const active = state.profiles.find(x => x.profileId === state.activeId);
    return state.activeId !== original.profileId && active?.experience.data[0].bullets[0].text === proposed;
  }).toBe(true);
  let state = await stored(page), copy = state.profiles.find(x => x.profileId === state.activeId);
  expect(state.profiles.find(x => x.profileId === original.profileId)).toEqual(original);
  expect(copy.experience.data[0].bullets[0].text).toBe(proposed);
  expect(copy.compositionReview.notes.some(n => n.includes('compare the added wording'))).toBe(true);
  await page.reload(); await saved(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/compare the added wording in this bullet/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Compare experience and projects' }).click();
  await expect(page.getByRole('button', { name: 'CV Tailor', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const footer = page.locator('.tailor-pane .tailor-footer');
  await expect(footer).toBeHidden();
  const scroll = page.getByRole('region', { name: 'CV tailoring inputs' });
  const openHeight = await scroll.evaluate(el => el.clientHeight);
  const comparison = page.locator('summary').filter({ hasText: 'Compare current experience and projects' });
  await expect(comparison).toBeFocused();
  const pair = page.getByRole('article', { name: 'Experience comparison 1' });
  await expect(pair.getByRole('region', { name: 'Current source' }).getByText(source, { exact: true })).toBeVisible();
  const copySide = pair.getByRole('region', { name: 'Current tailored copy' });
  await expect(copySide.getByText(proposed, { exact: true })).toBeVisible();
  await expect(copySide.getByText('No exact text match in current source bullets')).toBeVisible();
  await page.getByRole('button', { name: 'Close comparison and return to tailoring' }).click();
  await expect(pair).toBeHidden();
  await expect(footer).toBeVisible();
  await expect(footer).toContainText('Tailor CV sends professional resume content and this job to Google');
  await expect(footer).toContainText('automatic fallback may send the same content again');
  await expect(footer).toContainText('personal information typed into professional content or the job can be sent');
  await expect(footer).toContainText('New text is not factually certified');
  const closedHeight = await scroll.evaluate(el => el.clientHeight);
  expect(openHeight - closedHeight).toBeGreaterThan(100);
  await page.getByText(/Review 1 content note/).click();
  await page.getByRole('button', { name: 'Compare experience and projects' }).click();
  await expect(comparison).toBeFocused();
  await expect(pair).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(footer).toBeHidden();
  await expect.poll(() => scroll.evaluate(el => el.clientHeight)).toBeGreaterThan(150);
  // Collapsing the parent also restores the footer, even if the nested
  // comparison itself remains open, and reopening the parent hides it again.
  const parent = page.locator('summary').filter({ hasText: 'What changed during tailoring' });
  await parent.click(); await expect(footer).toBeVisible();
  await parent.click(); await expect(footer).toBeHidden();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(footer).toBeVisible(); // Desktop keeps its normal footer.

  const pdf = await exportedText(page, testInfo);
  expect(pdf).toContain(proposed); // Advisory only; the user must review/edit.
  expect(pdf).not.toContain('compare the added wording');
  // A later-deleted source cannot be guessed or compared. Notes remain visible.
  state = await stored(page); copy = state.profiles.find(x => x.profileId === state.activeId);
  await page.evaluate(async ({ profile, profileKey }) => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('keyval-store', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction('keyval', 'readwrite'); tx.objectStore('keyval').put([profile], profileKey); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  }, { profile: copy, profileKey: PROFILE_KEY });
  await page.reload(); await saved(page);
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/compare the added wording in this bullet/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare experience and projects' })).toHaveCount(0);
  await expect(page.getByText(/The source resume is not available, so a current comparison cannot be displayed/)).toBeVisible();
  checkWire(sc1Harness);
});

test('mobile comparison never hides cancellation during an in-flight request', async ({ page, sc1Harness }) => {
  const p = sourceProfile(true);
  p.experience.data[0].bullets[0].text = 'Documented API behavior for the developer team.';
  let delay = false, release;
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.entries[0].bullets[0].text = 'Documented API behavior for the developer team and deployed the APIs.';
    if (!delay) return { body: completed(document) };
    return new Promise(resolve => { release = () => resolve({ body: completed(document) }); });
  });
  const original = await seed(page, p); await tailor(page);
  await expect.poll(async () => (await stored(page)).activeId).not.toBe(original.profileId);
  await saved(page); await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'CV Tailor', exact: true }).click();
  delay = true;
  await acceptProviderConsent(page); await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
  await expect.poll(() => sc1Harness.calls.length).toBe(2);
  const footer = page.locator('.tailor-pane .tailor-footer');
  await expect(page.getByRole('button', { name: 'Cancel tailoring' })).toBeVisible();
  await page.getByText(/Review 1 content note/).click();
  await page.getByRole('button', { name: 'Compare experience and projects' }).click();
  await expect(page.getByRole('article', { name: 'Experience comparison 1' })).toBeVisible();
  await expect(footer).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel tailoring' })).toBeVisible();
  release();
  await expect(page.getByRole('button', { name: 'Cancel tailoring' })).toHaveCount(0);
  await expect(footer).toBeHidden(); // The open comparison gets space again once idle.
  expect(sc1Harness.calls).toHaveLength(2);
});

test('current comparison exposes changed and missing entry metadata without changing resumes', async ({ page, sc1Harness }) => {
  const p = sourceProfile(true);
  Object.assign(p.experience.data[0], { city: 'North Harbor', startDate: 'Jan 2024', endDate: 'Jun 2024', description: 'Supported a fictional training project.' });
  p.projects.data = [{ id: crypto.randomUUID(), name: 'Community Garden', role: 'Volunteer', url: 'https://example.invalid/garden', bullets: [{ id: crypto.randomUUID(), text: 'Coordinated planting days.', isVerified: true }] }];
  sc1Harness.respond(packet => ({ body: completed(authoredDocument(packet)) }));
  const original = await seed(page, p); await tailor(page); await saved(page);
  await expect.poll(async () => (await stored(page)).activeId).not.toBe(original.profileId);
  const state = await stored(page), copy = state.profiles.find(x => x.profileId === state.activeId);
  Object.assign(copy.experience.data[0], { city: '', startDate: 'Feb 2024', endDate: '', description: '' });
  Object.assign(copy.projects.data[0], { role: 'Coordinator', url: '' });
  await page.evaluate(async ({ profiles, profileKey }) => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('keyval-store', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction('keyval', 'readwrite'); tx.objectStore('keyval').put(profiles, profileKey); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  }, { profiles: state.profiles, profileKey: PROFILE_KEY });
  await page.reload(); await saved(page);
  await page.getByText('Compare current experience and projects', { exact: true }).click();
  const exp = page.getByRole('article', { name: 'Experience comparison 1' });
  const expSource = exp.getByRole('region', { name: 'Current source' });
  const expCopy = exp.getByRole('region', { name: 'Current tailored copy' });
  await expect(expSource).toContainText('Job title: Software Engineer');
  await expect(expSource).toContainText('Organization: Fictional Classroom');
  await expect(expSource).toContainText('Location: North Harbor');
  await expect(expSource).toContainText('Start date: Jan 2024');
  await expect(expSource).toContainText('End date: Jun 2024');
  await expect(expSource).toContainText('Supported a fictional training project.');
  await expect(expCopy).toContainText('Location: Not provided');
  await expect(expCopy).toContainText('Start date: Feb 2024');
  await expect(expCopy).toContainText('End date: Not provided');
  await expect(expCopy).toContainText('Overview: Not provided');
  const proj = page.getByRole('article', { name: 'Projects comparison 1' });
  await expect(proj.getByRole('region', { name: 'Current source' })).toContainText('Project name: Community Garden');
  await expect(proj.getByRole('region', { name: 'Current source' })).toContainText('Project role: Volunteer');
  await expect(proj.getByRole('region', { name: 'Current source' })).toContainText('Project link: https://example.invalid/garden');
  await expect(proj.getByRole('region', { name: 'Current tailored copy' })).toContainText('Project link: Not provided');
  await expect(proj.getByRole('region', { name: 'Current tailored copy' })).toContainText('Project role: Coordinator');
  const after = await stored(page);
  expect(after.profiles.find(x => x.profileId === original.profileId)).toEqual(original);
  expect(after.profiles.find(x => x.profileId === copy.profileId)).toEqual(copy);
  expect(sc1Harness.calls).toHaveLength(1);
});

test('safe shorter pagination matches the preview and downloaded PDF', async ({ page, sc1Harness }, testInfo) => {
  const p = sourceProfile();
  Object.assign(p.resumeHeader.data, { name: 'Fictional Person', firstName: 'Fictional', lastName: 'Person', email: 'fictional@example.invalid', phone: '', location: '', linkedin: '', github: '', portfolio: '', desiredJobPosition: 'Coordinator' });
  p.summary.data = 'Fictional coordinator supporting local community programs.';
  Object.assign(p.experience.data[0], { roleTitle: 'Program Coordinator', companyName: 'Example Association', startDate: '2022', endDate: '2025', city: '', description: '', bullets: Array.from({ length: 15 }, (_, i) => ({ id: crypto.randomUUID(), text: `Item ${i+1}: Coordinated fictional community events and organized volunteer schedules and materials.`, isVerified: true })) });
  p.education.data = Array.from({ length: 6 }, (_, i) => ({ id: crypto.randomUUID(), degree: `Fictional Diploma ${i+1}`, institution: 'Example College', city: '', startDate: '2020', endDate: '2021', description: '' }));
  p.certifications.data = Array.from({ length: 12 }, (_, i) => ({ id: crypto.randomUUID(), name: `Fictional Certificate ${String(i+1).padStart(2, '0')}`, issuer: 'Example Institute', date: 'Jan 2023' }));
  p.skills.data = []; p.projects.data = [];
  const original = await seed(page, p);
  await expect(page.locator('[data-pagination-current="true"]')).toContainText('2 pages · A4', { timeout: 30000 });
  await expect(page.locator('.pdf-preview-page')).toHaveCount(2);
  const pdf = await exportedText(page, testInfo);
  const downloadedBytes = await fs.readFile(testInfo.outputPath('synthetic-tailored.pdf'));
  const downloadedPages = await page.evaluate(async bytes => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
    const doc = await pdfjs.getDocument({ data: Uint8Array.from(bytes) }).promise;
    try { return doc.numPages; } finally { await doc.destroy(); }
  }, Array.from(downloadedBytes));
  expect(downloadedPages).toBe(2);
  for (let i = 1; i <= 6; i++) expect(pdf).toContain(`Fictional Diploma ${i}`);
  for (let i = 1; i <= 12; i++) expect(pdf).toContain(`Fictional Certificate ${String(i).padStart(2, '0')}`);
  for (let i = 1; i <= 15; i++) expect(pdf).toContain(`Item ${i}:`);
  expect((await stored(page)).profiles.find(x => x.profileId === original.profileId)).toEqual(original);
  expect(sc1Harness.calls).toHaveLength(0);
});

for (const [label, proposed] of [
  ['risky relationship rewrite', 'Coordinated laboratory maintenance and cross-team planning to align clinic schedules.'],
  ['faithful relationship rewrite', 'Aligned clinic schedules with laboratory maintenance through planning and cross-team coordination.'],
]) test(`changed entries have one neutral review prompt: ${label}`, async ({page,sc1Harness},testInfo) => {
  const p=sourceProfile(true),source='Aligned clinic schedules with laboratory maintenance through proactive planning and cross-team coordination.';
  p.experience.data[0].roleTitle='Clinic scheduler';p.experience.data[0].companyName='Fictional clinic';p.experience.data[0].bullets[0].text=source;
  sc1Harness.respond(packet=>{const doc=authoredDocument(packet);doc.entries[0].bullets[0].text=proposed;return {body:completed(doc)};});
  const original=await seed(page,p);await tailor(page);await saved(page);
  await expect.poll(async()=>{const s=await stored(page);return s.activeId!==original.profileId;}).toBe(true);
  let state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
  expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
  expect(copy.experience.data[0].bullets[0].text).toBe(proposed);
  expect(copy.compositionReview).toBeUndefined(); // This prompt is not a claimed detected error.
  expect(copy.compositionChanges.experience).toBe('edited');
  const prompt=page.locator('.composition-review-prompt');
  await expect(prompt).toHaveCount(1);await expect(prompt).toContainText('automatic checks cannot verify meaning');
  await page.reload();await saved(page);await page.setViewportSize({width:390,height:844});
  await expect(prompt).toBeVisible();await prompt.getByRole('button',{name:'Compare experience and projects'}).click();
  await expect(page.getByRole('button',{name:'CV Tailor',exact:true})).toHaveAttribute('aria-pressed','true');
  const pair=page.getByRole('article',{name:'Experience comparison 1'});
  await expect(pair.getByRole('region',{name:'Current source'}).getByText(source,{exact:true})).toBeVisible();
  await expect(pair.getByRole('region',{name:'Current tailored copy'}).getByText(proposed,{exact:true})).toBeVisible();
  await page.setViewportSize({width:320,height:568});
  await expect.poll(()=>page.getByRole('region',{name:'CV tailoring inputs'}).evaluate(el=>el.clientHeight)).toBeGreaterThan(150);
  await prompt.getByRole('button',{name:'Hide until reload'}).click();await expect(prompt).toHaveCount(0);
  await page.reload();await saved(page);await expect(prompt).toBeVisible();
  if(label==='risky relationship rewrite'){
    const pdf=await exportedText(page,testInfo);expect(pdf).toContain(proposed);expect(pdf).not.toContain('automatic checks cannot verify meaning');
    state=await stored(page);copy=state.profiles.find(x=>x.profileId===state.activeId);
    await page.evaluate(async ({profile,profileKey})=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('keyval-store',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('keyval','readwrite');tx.objectStore('keyval').put([profile],profileKey);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();},{profile:copy,profileKey:PROFILE_KEY});
    await page.reload();await saved(page);await expect(prompt).toContainText('source resume is unavailable');
    await expect(prompt.getByRole('button',{name:'Compare experience and projects'})).toHaveCount(0);
  }
  checkWire(sc1Harness);
});

test('optional source-wording mode preserves wording and missing bullets after save and reload', async ({page,sc1Harness}) => {
 const p=sourceProfile();p.experience.isLocked=false;
 p.experience.data[0].bullets.push({id:crypto.randomUUID(),text:'Organized weekly team meetings.',isVerified:true});
 sc1Harness.respond(packet=>{const d=authoredDocument(packet);d.entries[0].bullets=[d.entries[0].bullets[1]];return {body:completed(d)};});
 const original=await seed(page,p);
 await page.getByLabel('Keep source wording').check();
 await page.getByLabel('Allow AI to reorder original bullets').check();
 await expect(page.getByText(/some skills may be left out of the copy/)).toBeVisible();
 await page.getByLabel('Job description',{exact:true}).fill(JOB);
 await acceptProviderConsent(page); await page.getByRole('button',{name:'Tailor CV',exact:true}).click();
 await expect(page.getByText(/A new editable copy is open with your original summary/)).toBeVisible();
 await expect.poll(async()=>{const s=await stored(page);return s.profiles.length}).toBe(2);
 let state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.summary).toEqual(original.summary);
 expect(copy.experience.data[0].bullets).toEqual([original.experience.data[0].bullets[1],original.experience.data[0].bullets[0]]);
 expect(copy.compositionChanges.mode).toBe('source-wording');expect(copy.compositionChanges.summary).toBe('unchanged');expect(copy.compositionChanges.experience).toBe('reordered');
 await expect(page.getByText(/Mode used for this copy: Keep source wording/)).toBeVisible();
 await page.reload();await saved(page);state=await stored(page);copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(copy.summary).toEqual(original.summary);expect(copy.experience.data[0].bullets).toEqual([original.experience.data[0].bullets[1],original.experience.data[0].bullets[0]]);
 await expect(page.getByText(/Mode used for this copy: Keep source wording/)).toBeVisible();
 expect(sc1Harness.calls).toHaveLength(1);
});

test('source-wording mode cannot change mid-request and remains accessible on small screens', async ({page,sc1Harness}) => {
 let release;sc1Harness.respond(()=>new Promise(resolve=>{release=resolve}));
 await seed(page,sourceProfile());await page.setViewportSize({width:320,height:568});
 await page.getByRole('button',{name:'CV Tailor',exact:true}).click();
 const mode=page.getByLabel('Keep source wording');await mode.check();
 await page.getByLabel('Job description',{exact:true}).fill(JOB);await acceptProviderConsent(page); await page.getByRole('button',{name:'Tailor CV',exact:true}).click();
 await expect(mode).toBeDisabled();await expect.poll(()=>typeof release).toBe('function');
 release({status:503,body:{error:{code:503,status:'UNAVAILABLE'}}});
 await expect(page.getByText(ERROR_503,{exact:true})).toBeVisible();await expect(mode).toBeEnabled();await expect(mode).toBeChecked();
 expect(sc1Harness.calls).toHaveLength(1);
});

for (const stop of ['timeout', 'cancel']) for (const viewport of ['desktop', 'mobile']) test(`uncooperative provider ${stop} releases the ${viewport} app and ignores late success`, async ({page,sc1Harness}) => {
 const original=await seed(page,sourceProfile());
 if(viewport==='mobile') { await page.setViewportSize({width:320,height:568}); await page.getByRole('button',{name:'CV Tailor',exact:true}).click(); }
 await page.getByLabel('Job description',{exact:true}).fill(JOB);
 // Simulate a transport that ignores AbortSignal; no provider request leaves the page.
 await page.evaluate(() => {
   const originalFetch=window.fetch.bind(window);window.__stalledCalls=0;
   window.fetch=(input,init)=>{
     if(String(input).startsWith('https://generativelanguage.googleapis.com/')) {
       window.__stalledCalls++;return new Promise(resolve=>{window.__releaseStalled=()=>resolve(new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]}),{status:200}));});
     }
     return originalFetch(input,init);
   };
 });
 if(stop==='timeout') await page.clock.install();
 await acceptProviderConsent(page); await page.getByRole('button',{name:'Tailor CV',exact:true}).click();
 await expect(page.getByRole('button',{name:'Cancel tailoring'})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.__stalledCalls)).toBe(1);
 if(stop==='timeout') await page.clock.fastForward(300001);
 else await page.getByRole('button',{name:'Cancel tailoring'}).click();
 const status=page.getByText(stop==='timeout'?/Request timed out\./:/Composition cancelled; nothing was saved\.|Cancelled\. No copy was created/);
 await expect(status).toBeVisible();await expect(status).toBeInViewport();
 await expect(page.getByRole('button',{name:'Tailor CV',exact:true})).toBeEnabled();
 await page.evaluate(()=>window.__releaseStalled());
 await expect.poll(()=>page.evaluate(()=>window.__stalledCalls)).toBe(1);
 expect(await stored(page)).toEqual({profiles:[original],activeId:original.profileId});
 expect(sc1Harness.calls).toHaveLength(0);
});

test('mobile open comparison keeps stop message visible after cancellation', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);p.experience.data[0].bullets[0].text='Documented API behavior for the developer team.';
 sc1Harness.respond(packet=>{const doc=authoredDocument(packet);doc.entries[0].bullets[0].text='Documented API behavior for the developer team and deployed the APIs.';return {body:completed(doc)};});
 const original=await seed(page,p);await tailor(page);await expect.poll(async()=>(await stored(page)).activeId).not.toBe(original.profileId);await saved(page);
 await page.setViewportSize({width:320,height:568});await page.getByRole('button',{name:'CV Tailor',exact:true}).click();
 const before=await stored(page);
 await page.evaluate(()=>{const old=window.fetch.bind(window);window.fetch=(input,init)=>String(input).startsWith('https://generativelanguage.googleapis.com/')?new Promise(()=>{}):old(input,init);});
 await acceptProviderConsent(page); await page.getByRole('button',{name:'Tailor CV',exact:true}).click();
 await page.getByText(/Review 1 content note/).click();await page.getByRole('button',{name:'Compare experience and projects'}).click();
 await page.getByRole('button',{name:'Cancel tailoring'}).click();
 const status=page.getByText(/Composition cancelled; nothing was saved/);await expect(status).toBeVisible();await expect(status).toBeInViewport();
 await expect(page.locator('.tailor-pane .tailor-footer')).toBeVisible();expect(await stored(page)).toEqual(before);expect(sc1Harness.calls).toHaveLength(1);
});

test('restore a current source skill with its qualification in source-wording mode', async ({page,sc1Harness}) => {
 const p=sourceProfile();p.experience.isLocked=false;p.skills.isLocked=false;
 p.experience.data[0].bullets.push({id:crypto.randomUUID(),text:'Organized weekly team meetings.',isVerified:true});
 p.skills.data=[{id:crypto.randomUUID(),name:'محاسبة',category:'Technical',level:'دورة تمهيدية'}];
 sc1Harness.respond(packet=>{const d=authoredDocument(packet);d.entries[0].bullets.reverse();d.skillSelections=[];return {body:completed(d)};});
 const original=await seed(page,p);await page.getByLabel('Keep source wording').check();
 await expect(page.getByLabel('Allow AI to reorder original bullets')).not.toBeChecked();await tailor(page);
 await expect.poll(async()=>{const s=await stored(page);return s.profiles.length}).toBe(2);
 let state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);expect(copy.skills.data).toEqual([]);
 expect(copy.experience.data[0].bullets).toEqual(original.experience.data[0].bullets);expect(copy.compositionChanges.sourceReordering).toBe(false);
 const review=page.getByText('Review skills in the current source',{exact:true}).locator('..');
 await review.locator('summary').click();
 await expect(review.getByText('محاسبة — دورة تمهيدية (Technical)',{exact:true})).toBeVisible();
 await review.getByRole('button',{name:'Add to this copy',exact:true}).click();
 await expect.poll(async()=>{const s=await stored(page);return s.profiles.find(x=>x.profileId===s.activeId).skills.data.length}).toBe(1);
 await page.reload();await saved(page);state=await stored(page);copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(copy.skills.data).toEqual(original.skills.data);expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.compositionChanges.skills.excluded).toHaveLength(1);expect(sc1Harness.calls).toHaveLength(1);
});

test('same-named current source skill warns before explicit addition', async ({page,sc1Harness}) => {
 const p=sourceProfile();p.skills.isLocked=false;
 p.skills.data=[{id:crypto.randomUUID(),name:'Python',category:'Technical',level:'Coursework only'},{id:crypto.randomUUID(),name:'Python',category:'Languages',level:'Personal projects'}];
 sc1Harness.respond(packet=>{const d=authoredDocument(packet);d.skillSelections=[{id:'skill_1',category:'Technical'}];return {body:completed(d)};});
 await seed(page,p);await tailor(page);await expect.poll(async()=> (await stored(page)).profiles.length).toBe(2);
 const review=page.getByText('Review skills in the current source',{exact:true}).locator('..');await review.locator('summary').click();
 await expect(review.getByText('Python — Personal projects (Languages)',{exact:true})).toBeVisible();
 await expect(review.getByText(/A skill with this name is already in the copy/)).toBeVisible();
 await review.getByRole('button',{name:'Add to this copy'}).click();
 await expect.poll(async()=>{const s=await stored(page);return s.profiles.find(x=>x.profileId===s.activeId).skills.data.length}).toBe(2);
});
