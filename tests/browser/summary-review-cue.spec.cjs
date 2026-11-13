// Fictional offline UI tests. The provider endpoint is fulfilled locally; all other
// external traffic is blocked. These are not model-quality or factuality tests.
const { test: base, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { load } = require('../helpers/editorial-loader.cjs');
const { createSampleProfile } = load('mock/profile');
const ORIGIN = 'http://127.0.0.1:4187';
const PROFILE_KEY = 'cv-tailor-profiles-v2', ACTIVE_KEY = 'cv-tailor-active-id-v2';
const JOB = 'Pharmacy assistant: review medication charts, maintain dispensing logs and communicate with colleagues.';
const SOURCE_BULLET = 'Reviewed medication charts for a pharmacist to approve.';
const ORIGINAL_SUMMARY = 'Fictional pharmacy assistant supporting pharmacy administration.';
const PROPOSED_SUMMARY = 'Pharmacy assistant who approved medication charts after a pharmacist reviewed them.';
const ALTERED_BULLET = 'Approved medication charts after a pharmacist reviewed them.';

function fictionalProfile() {
  const p = createSampleProfile('Fictional summary review source');
  Object.assign(p.resumeHeader.data, { name: 'Fictional Person', firstName: 'Fictional', lastName: 'Person', desiredJobPosition: 'Pharmacy assistant', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' });
  p.headline.data = 'Pharmacy assistant';
  p.summary.data = ORIGINAL_SUMMARY; p.summary.isLocked = false;
  p.experience.isLocked = false;
  p.experience.data = [{ id: crypto.randomUUID(), roleTitle: 'Pharmacy assistant', companyName: 'Fictional pharmacy', city: '', startDate: '2022', endDate: '2025', description: '', bullets: [
    { id: crypto.randomUUID(), text: SOURCE_BULLET, isVerified: true },
    { id: crypto.randomUUID(), text: 'Maintained the dispensing log.', isVerified: true },
  ] }];
  p.projects.data = []; p.projects.isLocked = true;
  p.skills.data = []; p.skills.isLocked = true;
  p.education.data = []; p.certifications.data = []; p.customSections = [];
  return p;
}
function response(packet, options = {}) {
  const e = packet.source.experience[0], facts = new Map(packet.source.evidence.map(f => [f.id, f.text]));
  let bullets = e.bulletIds.map(id => ({ text: facts.get(id), sourceIds: [id] }));
  if (options.entryChanged) bullets[0].text = ALTERED_BULLET;
  if (options.reorder) bullets.reverse();
  const summarySegments = options.summaryUnchanged
    ? [{ text: ORIGINAL_SUMMARY, sourceIds: ['summary'] }]
    : [{ text: PROPOSED_SUMMARY, sourceIds: ['headline', e.bulletIds[0]] }];
  if (options.notes) summarySegments.push({ text: 'Managed Kubernetes for 500 clients.', sourceIds: [e.bulletIds[0]] });
  return { summarySegments, entries: [{ id: e.id, overview: { text: '', sourceIds: [] }, bullets }], skillSelections: [] };
}
function completed(document) { return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(document) }] } }] }; }
const test = base.extend({
  harness: async ({ context }, use) => {
    const external = [], errors = [], calls = [];
    let reply = () => { throw new Error('No fictional response configured'); };
    const watch = page => page.on('pageerror', error => errors.push(error.message));
    context.pages().forEach(watch); context.on('page', watch);
    await context.routeWebSocket('**/*', socket => { if (new URL(socket.url()).origin !== 'ws://127.0.0.1:4187') external.push(socket.url()); socket.close(); });
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === ORIGIN) return route.continue();
      if (url.origin === 'https://generativelanguage.googleapis.com' && /^\/v1beta\/models\/(?:gemini-3\.8-flash|gemini-3-flash-preview|gemini-3\.5-flash-lite):generateContent$/.test(url.pathname) && req.method() === 'POST') {
        calls.push(req.url());
        try {
          const packet = JSON.parse(req.postDataJSON().contents[0].parts[0].text);
          const document = await reply(packet);
          return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': ORIGIN }, body: JSON.stringify(completed(document)) });
        } catch (error) { errors.push(error.message); return route.fulfill({ status: 500, body: '{}' }); }
      }
      external.push(url.origin); return route.abort('blockedbyclient');
    });
    await use({ calls, respond: fn => { reply = fn; } });
    expect(external, 'Unexpected external requests').toEqual([]);
    expect(errors, 'Browser/provider mock errors').toEqual([]);
  },
});
async function stored(page) {
  return page.evaluate(async ({ profileKey, activeKey }) => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('keyval-store', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try {
      const tx = db.transaction('keyval', 'readonly'), store = tx.objectStore('keyval');
      const get = key => new Promise((resolve, reject) => { const r = store.get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const [profiles, activeId] = await Promise.all([get(profileKey), get(activeKey)]); return { profiles, activeId };
    } finally { db.close(); }
  }, { profileKey: PROFILE_KEY, activeKey: ACTIVE_KEY });
}
async function saveProfiles(page, profiles, activeId) {
  await page.evaluate(async ({ profiles, activeId, profileKey, activeKey }) => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('keyval-store', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { await new Promise((resolve, reject) => { const tx = db.transaction('keyval', 'readwrite'); tx.objectStore('keyval').put(profiles, profileKey); tx.objectStore('keyval').put(activeId, activeKey); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
  }, { profiles, activeId, profileKey: PROFILE_KEY, activeKey: ACTIVE_KEY });
}
async function saved(page) { await expect(page.getByText('Saved in this browser', { exact: true })).toBeVisible(); }
async function seed(page) {
  await page.goto('/'); await saved(page);
  const profile = fictionalProfile(); await saveProfiles(page, [profile], profile.profileId);
  await page.reload(); await expect(page.getByLabel('Resume document name')).toHaveValue(profile.profileName); await saved(page);
  return (await stored(page)).profiles[0];
}
async function tailor(page, original, harness, options = {}) {
  harness.respond(packet => response(packet, options));
  await page.getByLabel('Job description', { exact: true }).fill(JOB);
  await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
  await expect.poll(async () => (await stored(page)).activeId).not.toBe(original.profileId);
  await saved(page); const state = await stored(page);
  expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  return state.profiles.find(p => p.profileId === state.activeId);
}
const prompt = page => page.locator('.composition-review-prompt');
const summaryHeading = page => page.locator('summary').filter({ hasText: 'Compare current summaries' });
const summaryDetails = page => page.locator('details').filter({ has: page.locator(':scope > summary', { hasText: 'Compare current summaries' }) }).last();

test('summary-only cue opens current comparison, survives reload and remains usable at 320px', async ({ page, harness }) => {
  const original = await seed(page), copy = await tailor(page, original, harness);
  expect(copy.summary.data).toBe(PROPOSED_SUMMARY); expect(copy.compositionReview).toBeUndefined();
  expect(copy.compositionChanges.summary).toBe('changed'); expect(copy.compositionChanges.experience).toBe('unchanged');
  await expect(prompt(page)).toContainText('Summary changed during tailoring');
  await expect(prompt(page)).toContainText('automatic checks cannot verify meaning');
  await expect(prompt(page).getByRole('button', { name: 'Compare experience and projects' })).toHaveCount(0);
  await page.reload(); await saved(page); await page.setViewportSize({ width: 320, height: 568 });
  await prompt(page).getByRole('button', { name: 'Compare summaries' }).click();
  await expect(page.getByRole('button', { name: 'CV Tailor', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(summaryHeading(page)).toBeFocused();
  const detail = summaryDetails(page), scroll = page.getByRole('region', { name: 'CV tailoring inputs' }), footer = page.locator('.tailor-pane .tailor-footer');
  await expect(detail).toContainText('not a generation-time snapshot'); await expect(detail).toContainText('does not verify meaning or factual accuracy');
  await expect(detail.getByText(ORIGINAL_SUMMARY, { exact: true })).toBeVisible();
  await expect(detail.getByText(PROPOSED_SUMMARY, { exact: true })).toBeVisible();
  await expect(footer).toBeHidden(); await expect.poll(() => scroll.evaluate(el => el.clientHeight)).toBeGreaterThan(150);
  for (const text of [ORIGINAL_SUMMARY, PROPOSED_SUMMARY]) {
    const passage = detail.getByText(text, { exact: true }); await passage.scrollIntoViewIfNeeded();
    const box = await passage.boundingBox(), viewport = await scroll.boundingBox();
    expect(box.y + box.height).toBeGreaterThan(viewport.y); expect(box.y).toBeLessThan(viewport.y + viewport.height);
  }
  await detail.getByRole('button', { name: 'Close summary comparison' }).click();
  await expect(footer).toBeVisible(); await expect(summaryHeading(page)).toBeFocused();
  await expect(footer).toContainText('New text is not factually certified');
  // The manually toggled comparison and its parent control the same mobile space.
  await summaryHeading(page).press('Enter'); await expect(footer).toBeHidden();
  const parent = page.locator('summary').filter({ hasText: 'What changed during tailoring' });
  await parent.click(); await expect(footer).toBeVisible();
  await parent.click(); await expect(footer).toBeHidden();
  await detail.getByRole('button', { name: 'Close summary comparison' }).click(); await expect(footer).toBeVisible();
  await prompt(page).getByRole('button', { name: 'Hide until reload' }).click(); await expect(prompt(page)).toHaveCount(0);
  await page.reload(); await saved(page); await expect(prompt(page)).toBeVisible();
  // Mutate the two persisted fictional summaries, then verify this is a current comparison.
  const state = await stored(page), source = state.profiles.find(p => p.profileId === original.profileId), tailored = state.profiles.find(p => p.profileId === copy.profileId);
  source.summary.data = 'Later edited source summary.'; tailored.summary.data = 'Later edited tailored summary.';
  await saveProfiles(page, state.profiles, state.activeId); await page.reload(); await saved(page);
  await prompt(page).getByRole('button', { name: 'Compare summaries' }).click();
  await expect(detail.getByText('Later edited source summary.', { exact: true })).toBeVisible();
  await expect(detail.getByText('Later edited tailored summary.', { exact: true })).toBeVisible();
  expect(harness.calls).toHaveLength(1);
});

test('summary plus changed entries have one neutral cue with both direct comparisons', async ({ page, harness }) => {
  const original = await seed(page), copy = await tailor(page, original, harness, { entryChanged: true });
  expect(copy.compositionReview).toBeUndefined(); expect(copy.compositionChanges.experience).toBe('edited');
  await expect(prompt(page)).toHaveCount(1); await expect(prompt(page)).toContainText('Tailoring changed summary and entries');
  await page.setViewportSize({ width: 320, height: 568 });
  await prompt(page).getByRole('button', { name: 'Compare summaries' }).click(); await expect(summaryHeading(page)).toBeFocused();
  await expect.poll(() => page.getByRole('region', { name: 'CV tailoring inputs' }).evaluate(el => el.clientHeight)).toBeGreaterThan(150);
  await prompt(page).getByRole('button', { name: 'Compare experience and projects' }).click();
  await expect(page.locator('summary').filter({ hasText: 'Compare current experience and projects' })).toBeFocused();
  const pair = page.getByRole('article', { name: 'Experience comparison 1' });
  await expect(pair.getByRole('region', { name: 'Current source' }).getByText(SOURCE_BULLET, { exact: true })).toBeVisible();
  await expect(pair.getByRole('region', { name: 'Current tailored copy' }).getByText(ALTERED_BULLET, { exact: true })).toBeVisible();
  await expect(summaryDetails(page)).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Close comparison and return to tailoring' }).click();
  await expect(page.locator('.tailor-pane .tailor-footer')).toBeVisible();
  expect(harness.calls).toHaveLength(1);
});

test('notes banner offers summary comparison and retains entry access; no access if source removed', async ({ page, harness }) => {
  const original = await seed(page), copy = await tailor(page, original, harness, { notes: true });
  expect(copy.compositionReview.notes.length).toBeGreaterThan(0); expect(copy.summary.data).toBe(PROPOSED_SUMMARY);
  expect(copy.compositionChanges.experience).toBe('unchanged');
  await expect(prompt(page)).toHaveCount(0);
  await page.reload(); await saved(page); await page.setViewportSize({ width: 320, height: 568 });
  const notes = page.locator('.storage-warning').filter({ hasText: 'content note' });
  await notes.locator('summary').click();
  await expect(notes.getByRole('button', { name: 'Compare experience and projects' })).toBeVisible();
  await notes.getByRole('button', { name: 'Compare summaries' }).click();
  await expect(notes.locator('details')).not.toHaveAttribute('open', '');
  await expect(summaryHeading(page)).toBeFocused();
  await expect(summaryDetails(page).getByText(PROPOSED_SUMMARY, { exact: true })).toBeVisible();
  await expect.poll(() => page.getByRole('region', { name: 'CV tailoring inputs' }).evaluate(el => el.clientHeight)).toBeGreaterThan(150);
  const state = await stored(page); await saveProfiles(page, [state.profiles.find(p => p.profileId === copy.profileId)], copy.profileId);
  await page.reload(); await saved(page); await notes.locator('summary').click();
  await expect(notes.getByRole('button', { name: 'Compare summaries' })).toHaveCount(0);
  await expect(notes.getByRole('button', { name: 'Compare experience and projects' })).toHaveCount(0);
  await page.getByRole('button', { name: 'CV Tailor', exact: true }).click();
  await expect(page.getByText(/The source resume is not available, so a current comparison cannot be displayed/)).toBeVisible();
  expect(harness.calls).toHaveLength(1);
});

test('unchanged summary and entry reorder do not create a neutral cue', async ({ page, harness }) => {
  const original = await seed(page), copy = await tailor(page, original, harness, { summaryUnchanged: true, reorder: true });
  expect(copy.compositionReview).toBeUndefined(); expect(copy.compositionChanges.summary).toBe('unchanged');
  expect(copy.compositionChanges.experience).toBe('reordered');
  await expect(prompt(page)).toHaveCount(0); await page.reload(); await saved(page); await expect(prompt(page)).toHaveCount(0);
  expect(harness.calls).toHaveLength(1);
});

test('a changed summary with reordered entries exposes only the summary cue', async ({ page, harness }) => {
  const original = await seed(page), copy = await tailor(page, original, harness, { reorder: true });
  expect(copy.compositionReview).toBeUndefined(); expect(copy.compositionChanges.experience).toBe('reordered');
  await expect(prompt(page)).toContainText('Summary changed during tailoring');
  await expect(prompt(page).getByRole('button', { name: 'Compare summaries' })).toBeVisible();
  await expect(prompt(page).getByRole('button', { name: 'Compare experience and projects' })).toHaveCount(0);
  expect(harness.calls).toHaveLength(1);
});

test('missing source leaves a manual-review cue without comparison shortcut', async ({ page, harness }) => {
  const original = await seed(page), copy = await tailor(page, original, harness);
  await saveProfiles(page, [copy], copy.profileId); await page.reload(); await saved(page);
  await expect(prompt(page)).toContainText('source resume is unavailable');
  await expect(prompt(page).getByRole('button', { name: 'Compare summaries' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'CV Tailor', exact: true }).click();
  await expect(page.getByText(/The source resume is not available, so a current comparison cannot be displayed/)).toBeVisible();
  expect(harness.calls).toHaveLength(1);
});

test('entry-only changes retain the existing entry reminder', async ({ page, harness }) => {
  const original = await seed(page), copy = await tailor(page, original, harness, { summaryUnchanged: true, entryChanged: true });
  expect(copy.compositionReview).toBeUndefined(); expect(copy.compositionChanges.summary).toBe('unchanged');
  await expect(prompt(page)).toContainText('Experience or projects changed during tailoring');
  await expect(prompt(page).getByRole('button', { name: 'Compare summaries' })).toHaveCount(0);
  await prompt(page).getByRole('button', { name: 'Compare experience and projects' }).click();
  await expect(page.getByRole('article', { name: 'Experience comparison 1' })).toBeVisible();
  expect(harness.calls).toHaveLength(1);
});

test('the neutral summary cue is not included in the exported fictional PDF', async ({ page, harness }) => {
  const original = await seed(page), copy = await tailor(page, original, harness);
  expect(copy.summary.data).toBe(PROPOSED_SUMMARY);
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await downloadPromise; expect(await download.failure()).toBeNull();
  const bytes = await fs.readFile(await download.path());
  const text = await page.evaluate(async bytes => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
    const doc = await pdfjs.getDocument({ data: Uint8Array.from(bytes) }).promise;
    try { const pages = []; for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map(item => item.str ?? '').join(' ')); return pages.join(' ').replace(/\s+/g, ' '); }
    finally { await doc.destroy(); }
  }, Array.from(bytes));
  expect(text).toContain(PROPOSED_SUMMARY);
  expect(text).not.toContain('automatic checks cannot verify meaning');
  expect(text).not.toContain('Compare summaries');
  expect(harness.calls).toHaveLength(1);
});

test('unchanged response makes no copy and no review cue', async ({ page, harness }) => {
  const original = await seed(page);
  harness.respond(packet => response(packet, { summaryUnchanged: true }));
  await page.getByLabel('Job description', { exact: true }).fill(JOB);
  await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
  await expect(page.getByText(/The content was unchanged. No duplicate copy was created/)).toBeVisible();
  await saved(page);
  const state = await stored(page); expect(state.activeId).toBe(original.profileId);
  expect(state.profiles).toEqual([original]); await expect(prompt(page)).toHaveCount(0);
  expect(harness.calls).toHaveLength(1);
});

test('an open summary comparison never hides cancellation during a request', async ({ page, harness }) => {
  const original = await seed(page); await tailor(page, original, harness);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'CV Tailor', exact: true }).click();
  let release;
  harness.respond(packet => new Promise(resolve => { release = () => resolve(response(packet)); }));
  await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
  await expect.poll(() => harness.calls.length).toBe(2);
  await prompt(page).getByRole('button', { name: 'Compare summaries' }).click();
  await expect(summaryHeading(page)).toBeFocused();
  await expect(page.locator('.tailor-pane .tailor-footer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel tailoring' })).toBeVisible();
  const beforeCancel = await stored(page);
  await page.getByRole('button', { name: 'Cancel tailoring' }).click(); release();
  await expect(page.getByRole('button', { name: 'Cancel tailoring' })).toHaveCount(0);
  await expect(page.locator('.tailor-pane .tailor-footer')).toBeVisible();
  const message = page.getByText(/Composition cancelled; nothing was saved/);
  await expect(message).toBeVisible(); await expect(message).toBeInViewport();
  expect(await stored(page)).toEqual(beforeCancel);
});

test('empty AI summary warns on an unchanged result without making a copy', async ({page,harness}) => {
 const original=await seed(page);
 harness.respond(packet=>{const d=response(packet,{summaryUnchanged:true});d.summarySegments=[];return d;});
 await page.getByLabel('Job description',{exact:true}).fill(JOB);await page.getByRole('button',{name:'Tailor CV',exact:true}).click();
 await expect(page.getByText(/The content was unchanged. No duplicate copy was created/)).toBeVisible();
 await page.getByText(/Content review notes/).click();
 await expect(page.getByText(/The primary AI draft had no summary/).first()).toBeVisible();
 const state=await stored(page);expect(state.activeId).toBe(original.profileId);expect(state.profiles).toEqual([original]);expect(harness.calls).toHaveLength(1);
});
test('empty AI summary warning persists with an edited copy after reload', async ({page,harness},testInfo) => {
 const original=await seed(page);
 harness.respond(packet=>{const d=response(packet,{entryChanged:true});d.summarySegments=[];return d;});
 await page.getByLabel('Job description',{exact:true}).fill(JOB);await page.getByRole('button',{name:'Tailor CV',exact:true}).click();
 await expect.poll(async()=> (await stored(page)).activeId).not.toBe(original.profileId);await saved(page);
 let state=await stored(page),copy=state.profiles.find(p=>p.profileId===state.activeId);
 expect(copy.summary.data).toBe(original.summary.data);expect(state.profiles.find(p=>p.profileId===original.profileId)).toEqual(original);
 expect(copy.compositionReview.notes.some(n=>n.includes('primary AI draft had no summary'))).toBe(true);
 await page.reload();await saved(page);await page.getByText(/Review \d+ content notes?/).click();
 await expect(page.getByText(/The primary AI draft had no summary/).first()).toBeVisible();
});
