// Offline app-path acceptance, NOT a model response or a writing-quality verdict.
const { test: base, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { load } = require('../helpers/editorial-loader.cjs');
const { createSampleProfile } = load('mock/profile');

const ORIGIN = 'http://127.0.0.1:4187';
const PROVIDER_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';
const JOB = 'Software Engineer: build internal web applications, document delivery work and collaborate with the team. Classroom experience is acceptable.';
const NARRATIVE_SUMMARY = 'Software engineer with classroom experience building internal web applications.';
const GENERATED_SUMMARY = NARRATIVE_SUMMARY;
const EDITED_SUMMARY = 'Built internal web applications for a classroom exercise.';
const ERROR_503 = 'Google rejected the request (HTTP 503; UNAVAILABLE). Provider-reported details, not a verification of account usage. No automatic retry. Your resumes are unchanged.';
const PROFILE_KEY = 'cv-tailor-profiles-v2';
const ACTIVE_KEY = 'cv-tailor-active-id-v2';

function sourceProfile(summaryLocked = false) {
  const p = createSampleProfile('SC5 Offline Synthetic Source');
  p.documentTheme = { accentColor: '#2557a7', fontFamily: 'sans', fontSize: 'medium', lineSpacing: 'normal', layoutStyle: 'modern' };
  Object.assign(p.resumeHeader.data, { name: 'Fictional Sample', firstName: 'Fictional', lastName: 'Sample', desiredJobPosition: 'Software Engineer', email: 'SC5_PRIVATE_CONTACT@example.invalid', phone: '', linkedin: '', github: '', portfolio: '' });
  p.resumeHeader.isLocked = true;
  p.headline.data = 'Software Engineer';
  p.summary.data = 'Fictional software engineer supporting web application delivery.';
  p.summary.isLocked = summaryLocked;
  p.experience.isLocked = !summaryLocked;
  p.experience.data = [{ id: crypto.randomUUID(), roleTitle: 'Software Engineer', companyName: 'Fictional Classroom', city: '', startDate: 'Jan 2024', endDate: 'Jun 2024', description: '', bullets: [{ id: crypto.randomUUID(), text: EDITED_SUMMARY, isVerified: true }] }];
  p.projects.data = [];
  p.projects.isLocked = true;
  p.skills.data = [{ id: crypto.randomUUID(), name: 'Python', category: 'Technical', level: 'Coursework only' }];
  p.skills.isLocked = true;
  p.education.isLocked = true;
  p.certifications.isLocked = true;
  return p;
}

// Respond from the REAL outbound packet. No schema/compiler/store/UI stubs.
function authoredDocument(packet) {
  const s = packet.source, facts = new Map(s.evidence.map(f => [f.id, f]));
  return {
    summarySegments: s.locks.summary ? [] : [{ text: NARRATIVE_SUMMARY, sourceIds: ['work_1_b1'] }],
    entries: [
      ...s.experience.filter(() => !s.locks.experience),
      ...s.projects.filter(() => !s.locks.projects),
    ].map(e => ({
      id: e.id,
      overview: e.overviewId ? { text: facts.get(e.overviewId).text, sourceIds: [e.overviewId] } : { text: '', sourceIds: [] },
      bullets: e.bulletIds.map(id => ({ text: facts.get(id).text.replace(/^Built /, 'Developed '), sourceIds: [id] })),
    })),
    skillSelections: [],
  };
}
function completed(document) {
  return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(document) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } };
}

const test = base.extend({
  sc1Harness: async ({ context }, use) => {
    const calls = [], external = [], pageErrors = [];
    let reply = () => { throw new Error('No synthetic provider response configured'); };
    const observePage = page => page.on('pageerror', error => pageErrors.push(error.message));
    context.pages().forEach(observePage);
    context.on('page', observePage);
    await context.routeWebSocket('**/*', socket => {
      const origin = new URL(socket.url()).origin;
      // Vite's client may still attempt its loopback websocket with HMR disabled.
      // Close it locally; only non-loopback attempts violate external isolation.
      if (origin !== 'ws://127.0.0.1:4187') external.push(origin);
      socket.close();
    });
    // Mock exactly the intended endpoint; fail closed for all other external traffic.
    await context.route('**/*', async route => {
      const request = route.request(), url = request.url();
      if (new URL(url).origin === ORIGIN) return route.continue();
      if (url === PROVIDER_URL && request.method() === 'POST') {
        const body = request.postDataJSON();
        calls.push({ body, headers: request.headers() });
        try {
          const response = reply(JSON.parse(body.contents[0].parts[0].text));
          return route.fulfill({ status: response.status ?? 200, contentType: 'application/json', headers: { 'access-control-allow-origin': ORIGIN }, body: JSON.stringify(response.body) });
        } catch (error) {
          pageErrors.push(error.message);
          return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        }
      }
      external.push(new URL(url).origin);
      return route.abort('blockedbyclient');
    });
    await use({ calls, respond: fn => { reply = fn; } });
    expect(external, 'No unexpected external requests may escape the offline harness').toEqual([]);
    expect(pageErrors, 'The real application must not raise browser errors').toEqual([]);
  },
});

async function stored(page) {
  return page.evaluate(async ({ profileKey, activeKey }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction('keyval', 'readonly'), store = transaction.objectStore('keyval');
      const read = key => new Promise((resolve, reject) => { const r = store.get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const [profiles, activeId] = await Promise.all([read(profileKey), read(activeKey)]);
      return { profiles, activeId };
    } finally { db.close(); }
  }, { profileKey: PROFILE_KEY, activeKey: ACTIVE_KEY });
}
async function saved(page) { await expect(page.getByText('Saved in this browser', { exact: true })).toBeVisible(); }
async function seed(page, source) {
  await page.goto('/');
  await saved(page);
  await page.evaluate(async ({ source, profileKey, activeKey }) => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('keyval-store', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('keyval', 'readwrite'), store = tx.objectStore('keyval');
        store.put([source], profileKey); store.put(source.profileId, activeKey); store.put(source.documentTheme, 'cv-tailor-builder-theme-v1');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { source, profileKey: PROFILE_KEY, activeKey: ACTIVE_KEY });
  await page.reload();
  await expect(page.getByLabel('Resume document name')).toHaveValue(source.profileName);
  await saved(page);
  return (await stored(page)).profiles[0]; // Snapshot after the REAL loader's normalization.
}
async function tailor(page) {
  await expect(page.getByText('SC5.1 · Gemini 3.5 Flash-Lite · experimental', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Job description', { exact: true }).fill(JOB);
  await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
}
function checkWire(sc1Harness) {
  expect(sc1Harness.calls).toHaveLength(1);
  const { body, headers } = sc1Harness.calls[0];
  expect(headers['x-goog-api-key']).toBe('synthetic-offline-sc1-key');
  expect(body.generationConfig).toEqual({ responseMimeType: 'application/json', responseSchema: expect.any(Object), maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'medium' } });
  expect(body.systemInstruction.parts[0].text).toContain('SUMMARY PURPOSE:');
  expect(body.systemInstruction.parts[0].text).toContain('Lead directly with relevant supported work');
  expect(body.systemInstruction.parts[0].text).toContain('CAPABILITY SEPARATION:');
  expect(body.systemInstruction.parts[0].text).toContain('Skill listings belong in the Skills section');
  const packet = JSON.parse(body.contents[0].parts[0].text);
  expect(packet.job).toBe(JOB);
  expect(packet.documentBrief.summaryEvidence).toBeDefined();
  expect(packet.documentBrief.authoringView).toBeDefined();
  expect(body.generationConfig.responseSchema.required).toEqual(['summarySegments', 'entries', 'skillSelections']);
  expect(JSON.stringify(body)).not.toContain('SC5_PRIVATE_CONTACT');
}
function checkPreserved(original, copy) {
  for (const key of ['resumeHeader', 'headline', 'education', 'certifications', 'projects', 'skills', 'documentTheme', 'customSections', 'pageLayout']) expect(copy[key], key).toEqual(original[key]);
  for (const key of ['summary', 'experience', 'projects', 'skills']) if (original[key].isLocked) expect(copy[key], `locked ${key}`).toEqual(original[key]);
  for (const section of ['experience', 'projects']) {
    const metadata = entries => entries.map(({ id, roleTitle, companyName, projectName, city, startDate, endDate }) => ({ id, roleTitle, companyName, projectName, city, startDate, endDate }));
    expect(metadata(copy[section].data), `${section} identity/dates`).toEqual(metadata(original[section].data));
  }
  expect(copy.profileId).not.toBe(original.profileId);
  expect(copy.baseProfileId).toBe(original.profileId);
  expect(copy.version).toBe(original.version + 1);
}
async function exportedText(page, testInfo) {
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const destination = testInfo.outputPath('synthetic-tailored.pdf');
  await download.saveAs(destination);
  const bytes = await fs.readFile(destination);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  // Parse the actual download with the project's local PDF.js in a real browser.
  return page.evaluate(async bytes => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
    const document = await pdfjs.getDocument({ data: Uint8Array.from(bytes) }).promise;
    try {
      const pages = [];
      for (let i = 1; i <= document.numPages; i++) pages.push((await (await document.getPage(i)).getTextContent()).items.map(x => x.str ?? '').join(' '));
      return pages.join(' ').replace(/\s+/g, ' ');
    } finally { await document.destroy(); }
  }, Array.from(bytes));
}

for (const summaryLocked of [false, true]) {
  test(`SC5.1 success: ${summaryLocked ? 'locked summary' : 'locked experience'} survives editable-copy, save/reopen and PDF`, async ({ page, sc1Harness }, testInfo) => {
    sc1Harness.respond(packet => ({ body: completed(authoredDocument(packet)) }));
    const original = await seed(page, sourceProfile(summaryLocked));
    await tailor(page);
    await expect(page.getByText('A new editable copy is open.', { exact: false })).toBeVisible();
    await expect.poll(async () => (await stored(page)).profiles.length).toBe(2);
    await saved(page);
    let state = await stored(page), copy = state.profiles.find(p => p.profileId === state.activeId);
    expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
    checkPreserved(original, copy);
    const copyId = copy.profileId;
    if (!summaryLocked) {
      expect(copy.summary.data).toBe(GENERATED_SUMMARY);
      await page.reload(); await saved(page);
      expect((await stored(page)).profiles.find(p => p.profileId === copyId).summary.data).toBe(GENERATED_SUMMARY);
      const initialPdf = await exportedText(page, testInfo);
      expect(initialPdf).toContain(NARRATIVE_SUMMARY);
      expect(initialPdf).not.toContain('Relevant skills:');
      expect(initialPdf).toContain('Coursework only');
      await page.reload(); await saved(page);
    }
    // Exercise a real editor control, rather than mutating the store from the test.
    await page.getByLabel('Resume document name').fill('SC5 Edited Synthetic Copy');
    if (!summaryLocked) {
      const toggle = page.locator('[data-section-card="summary"] .section-accordion-toggle');
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
      await expect(page.getByLabel('Your professional summary', { exact: true })).toHaveValue(GENERATED_SUMMARY);
      await page.getByLabel('Your professional summary', { exact: true }).fill(EDITED_SUMMARY);
    }
    await expect.poll(async () => (await stored(page)).profiles.find(p => p.profileId === copyId).profileName).toBe('SC5 Edited Synthetic Copy');
    await saved(page);
    state = await stored(page); copy = state.profiles.find(p => p.profileId === copyId);
    await page.reload(); await saved(page);
    await expect(page.getByLabel('Resume document name')).toHaveValue('SC5 Edited Synthetic Copy');
    const reopened = await stored(page);
    expect(reopened.activeId).toBe(copyId);
    expect(reopened.profiles).toHaveLength(2);
    expect(reopened.profiles.find(p => p.profileId === copyId)).toEqual(copy);
    expect(reopened.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
    checkPreserved(original, copy);
    const pdf = await exportedText(page, testInfo);
    expect(pdf).toContain('Fictional Sample');
    expect(pdf).toContain(summaryLocked ? original.summary.data : EDITED_SUMMARY);
    expect(pdf).toContain(summaryLocked ? 'Developed internal web applications for a classroom exercise.' : EDITED_SUMMARY);
    expect(pdf).toContain('Fictional Classroom');
    checkWire(sc1Harness);
  });
}

test('SC5 exact HTTP503/UNAVAILABLE leaves original and saved resumes unchanged without retry', async ({ page, sc1Harness }) => {
  sc1Harness.respond(() => ({ status: 503, body: { error: { code: 503, status: 'UNAVAILABLE', message: 'Synthetic provider failure' } } }));
  const original = await seed(page, sourceProfile());
  await tailor(page);
  await expect(page.getByText(ERROR_503, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tailor CV', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Source resume', { exact: true }).locator('option')).toHaveCount(1);
  await page.waitForTimeout(1200); // Bounded observation after the request has settled; no retries enabled in the test runner.
  expect(await stored(page)).toEqual({ profiles: [original], activeId: original.profileId });
  await page.reload(); await saved(page);
  expect(await stored(page)).toEqual({ profiles: [original], activeId: original.profileId });
  checkWire(sc1Harness);
});

test('invalid summary references preserve the original and show a review note', async ({ page, sc1Harness }) => {
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.summarySegments[0].sourceIds = ['invented_source_id'];
    return { body: completed(document) };
  });
  const original = await seed(page, sourceProfile());
  await tailor(page);
  await expect(page.getByText('The content was unchanged. No duplicate copy was created.', { exact: false })).toBeVisible();
  await page.getByText(/Content review notes ·/).click();
  await expect(page.getByText(/Removed a summary sentence that cited content not found/)).toBeVisible();
  expect(await stored(page)).toEqual({ profiles: [original], activeId: original.profileId });
  checkWire(sc1Harness);
});

test('profile-only introduction preserves the original and shows a review note', async ({ page, sc1Harness }) => {
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.summarySegments = [{ text: 'Software engineer supporting delivery.', sourceIds: ['summary'] }];
    return { body: completed(document) };
  });
  const original = await seed(page, sourceProfile(false));
  await tailor(page);
  await expect(page.getByText('The content was unchanged. No duplicate copy was created.', { exact: false })).toBeVisible();
  await page.getByText(/Content review notes ·/).click();
  await expect(page.getByText(/not based on your experience/)).toBeVisible();
  expect(await stored(page)).toEqual({ profiles: [original], activeId: original.profileId });
  checkWire(sc1Harness);
});

test('restored unsupported work line is visible in editor review notes', async ({ page, sc1Harness }) => {
  const p = sourceProfile(false); p.experience.isLocked = false;
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.entries[0].bullets[0].text = 'Built applications with Kubernetes.';
    return { body: completed(document) };
  });
  const original = await seed(page, p); await tailor(page);
  await expect(page.getByText('Some content needs your review; open the notes for details.', {exact: false})).toBeVisible();
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/kept your original wording because the rewrite added/).first()).toBeVisible();
  await saved(page);
  const state = await stored(page), copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  expect(copy.experience.data[0].bullets[0].text).toBe(original.experience.data[0].bullets[0].text);
  expect(copy.summary.data).toBe(NARRATIVE_SUMMARY);
  checkWire(sc1Harness);
});

test('reordered supported technical wording stays in the copy with a visible caution', async ({ page, sc1Harness }) => {
  const p = sourceProfile(false); p.experience.isLocked = false;
  p.experience.data[0].bullets[0].text = 'Built APIs using Python.';
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.summarySegments = [{ text: 'Built APIs using Python.', sourceIds: ['work_1_b1'] }];
    document.entries[0].bullets[0].text = 'Built Python APIs.';
    return { body: completed(document) };
  });
  const original = await seed(page, p); await tailor(page);
  await expect(page.getByText('Some content needs your review; open the notes for details.', { exact: false })).toBeVisible();
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/this literal match does not verify the claim or its scope/).first()).toBeVisible();
  await saved(page);
  const state = await stored(page), copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  expect(copy.experience.data[0].bullets[0].text).toBe('Built Python APIs.');
  checkWire(sc1Harness);
});

test('SC5 rejects stale SC4 capability append instead of silently printing import labels', async ({ page, sc1Harness }) => {
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);document.summaryCapabilityIds = ['skill_1'];
    return { body: completed(document) };
  });
  const original = await seed(page, sourceProfile(false));await tailor(page);
  await expect(page.getByText('summaryCapabilityIds', { exact: false })).toBeVisible();
  expect((await stored(page)).profiles).toEqual([original]);
  await page.reload();await saved(page);expect((await stored(page)).profiles).toEqual([original]);
  checkWire(sc1Harness);
});

test('SC5.1 complementary supported summary and selected documentation survive real save/reopen/PDF', async ({ page, sc1Harness }, testInfo) => {
  const p = sourceProfile();
  p.skills.isLocked = false;
  p.skills.data.push({ id: crypto.randomUUID(), name: 'Technical Documentation', category: 'Technical', level: '' });
  p.experience.data[0].bullets.push({ id: crypto.randomUUID(), text: 'Wrote setup documentation for the classroom application.', isVerified: true });
  const composed = 'Classroom web application work with setup documentation.';
  sc1Harness.respond(packet => {
    const view = packet.documentBrief.authoringView;
    expect(view.contributionsByEntry[0].contributions).toHaveLength(2);
    expect(view.contributionsByEntry[0].locked).toBe(true);
    expect([...view.capabilityGroups.flatMap(g => g.capabilities), ...view.ungroupedCapabilities].map(s => s.text)).toContain('Technical Documentation');
    const raw = authoredDocument(packet);
    raw.summarySegments = [{ text: composed, sourceIds: ['work_1_b1', 'work_1_b2'] }];
    raw.skillSelections = [{ id: 'skill_1', category: 'Languages' }, { id: 'skill_2', category: 'Technical' }];
    return { body: completed(raw) };
  });
  const original = await seed(page, p);
  await tailor(page);
  await expect(page.getByText('A new editable copy is open.', { exact: false })).toBeVisible();
  await saved(page);
  let state = await stored(page), copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  expect(copy.summary.data).toBe(composed);
  for (const key of ['resumeHeader', 'headline', 'education', 'certifications', 'experience', 'projects', 'documentTheme', 'customSections', 'pageLayout']) expect(copy[key], key).toEqual(original[key]);
  expect(copy.skills.data.map(({ name, level, category }) => ({ name, level, category }))).toEqual([
    { name: 'Python', level: 'Coursework only', category: 'Languages' },
    { name: 'Technical Documentation', level: '', category: 'Technical' },
  ]);
  const copyId = copy.profileId;
  expect(copyId).not.toBe(original.profileId);
  expect(copy.baseProfileId).toBe(original.profileId);
  await page.reload(); await saved(page);
  state = await stored(page);
  expect(state.profiles).toHaveLength(2);
  expect(state.profiles.find(p => p.profileId === copyId)).toEqual(copy);
  const pdf = await exportedText(page, testInfo);
  expect(pdf).toContain(composed);
  expect(pdf).toContain('Technical Documentation');
  expect(pdf).toContain('Coursework only');
  expect(pdf).not.toContain('Relevant skills:');
  checkWire(sc1Harness);
});
