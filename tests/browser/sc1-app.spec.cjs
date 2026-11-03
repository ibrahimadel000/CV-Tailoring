// Offline app-path acceptance, NOT a model response or a writing-quality verdict.
const { test: base, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { load } = require('../helpers/editorial-loader.cjs');
const { createSampleProfile } = load('mock/profile');

const ORIGIN = 'http://127.0.0.1:4187';
const PROVIDER_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';
const JOB = 'Software Engineer: build internal data dashboards, document delivery work and collaborate with the team. Classroom experience is acceptable.';
const NARRATIVE_SUMMARY = 'Software engineer with classroom experience building internal data dashboards.';
const GENERATED_SUMMARY = NARRATIVE_SUMMARY;
const EDITED_SUMMARY = 'Built internal data dashboards for a classroom exercise.';
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
async function tailor(page, job = JOB) {
  await expect(page.getByText('SC5.9 · Gemini 3.5 Flash-Lite · experimental', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Job description', { exact: true }).fill(job);
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
  expect(body.generationConfig.responseSchema.required).toEqual(['summarySegments', 'alternativeSummarySegments', 'entries', 'skillSelections']);
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
    expect(copy.compositionReview).toBeUndefined(); // Clean cases do not acquire review metadata.
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
    expect(pdf).toContain(summaryLocked ? 'Developed internal data dashboards for a classroom exercise.' : EDITED_SUMMARY);
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
  await expect(page.getByText(/did not cite required experience or qualification evidence/)).toBeVisible();
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

test('unsupported summary additions are omitted with a visible review note', async ({ page, sc1Harness }, testInfo) => {
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.summarySegments.push({ text: 'Delivered Kubernetes applications for 500 clients.', sourceIds: ['work_1_b1'] });
    return { body: completed(document) };
  });
  const original = await seed(page, sourceProfile(false)); await tailor(page);
  await expect(page.getByText('Some content needs your review; open the notes for details.', { exact: false })).toBeVisible();
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/Removed a generated summary passage because it added/).first()).toContainText('Kubernetes');
  await expect(page.getByText(/Removed a generated summary passage because it added/).first()).toContainText('500');
  await saved(page);
  let state = await stored(page), copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  expect(copy.summary.data).toBe(NARRATIVE_SUMMARY);
  await page.reload(); await saved(page);
  state = await stored(page); copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(copy.summary.data).toBe(NARRATIVE_SUMMARY);
  await expect(page.getByText('Some content needs your review; open the notes for details.', { exact: false })).toBeVisible();
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/Removed a generated summary passage because it added/).first()).toContainText('500');
  await expect(page.getByText(/These notes were recorded during tailoring and may not reflect later edits/)).toBeVisible();
  const copyId = copy.profileId;
  await page.getByLabel('Source resume', { exact: true }).selectOption(original.profileId);
  await expect(page.getByText('Some content needs your review; open the notes for details.', { exact: false })).toHaveCount(0);
  await page.getByLabel('Source resume', { exact: true }).selectOption(copyId);
  await expect(page.getByText('Some content needs your review; open the notes for details.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Hide until reload' }).click();
  await expect(page.getByText('Some content needs your review; open the notes for details.', { exact: false })).toHaveCount(0);
  await saved(page); await page.reload(); await saved(page);
  await expect(page.getByText('Some content needs your review; open the notes for details.', { exact: false })).toBeVisible();
  const pdf = await exportedText(page, testInfo);
  expect(pdf).toContain(NARRATIVE_SUMMARY); expect(pdf).not.toContain('Delivered Kubernetes applications'); expect(pdf).not.toContain('500 clients');
  expect(pdf).not.toContain('Some content needs your review');
  expect(pdf).toContain('Certified Kubernetes Application Developer'); // Existing source qualifications remain intact.
  const toggle = page.locator('[data-section-card="summary"] .section-accordion-toggle');
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByLabel('Your professional summary', { exact: true }).fill('Built applications in a classroom exercise.');
  await expect.poll(async () => (await stored(page)).profiles.find(p => p.profileId === copyId).summary.data).toBe('Built applications in a classroom exercise.');
  await saved(page); await page.reload(); await saved(page);
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/may not reflect later edits/)).toBeVisible();
  expect((await stored(page)).profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  checkWire(sc1Harness);
});

test('copied introduction passage is removed, with note and separate copy preserved', async ({ page, sc1Harness }, testInfo) => {
  const source = sourceProfile(false);
  const copied = 'Designed and engineered resilient data dashboards and reporting architectures for reporting operations.';
  source.experience.data[0].bullets = [
    { id: crypto.randomUUID(), text: copied, isVerified: true },
    { id: crypto.randomUUID(), text: 'Aligned technical execution with operational goals through cross-functional collaboration.', isVerified: true },
  ];
  const synthesized = 'Software engineer combining application design with operational collaboration.';
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.summarySegments = [
      { text: synthesized, sourceIds: ['work_1_b1', 'work_1_b2'] },
      { text: copied, sourceIds: ['work_1_b1'] },
    ];
    return { body: completed(document) };
  });
  const original = await seed(page, source); await tailor(page);
  await expect(page.getByText('Some content needs your review; open the notes for details.', { exact: false })).toBeVisible();
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/Removed a summary sentence that repeats one experience\/project passage/).first()).toBeVisible();
  await saved(page); let state = await stored(page), copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(copy.summary.data).toBe(synthesized);
  expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  checkPreserved(original, copy);
  await page.reload(); await saved(page);
  state = await stored(page); copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(copy.summary.data).toBe(synthesized);
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/Removed a summary sentence that repeats one experience\/project passage/).first()).toBeVisible();
  const pdf = await exportedText(page, testInfo);
  expect(pdf).toContain(synthesized); expect(pdf).toContain(copied); // The original experience remains.
  checkWire(sc1Harness);
});

test('two-contribution summary with a short overlapping source survives save and PDF', async ({ page, sc1Harness }, testInfo) => {
  const source = sourceProfile(false);
  source.experience.data[0].bullets = [
    { id: crypto.randomUUID(), text: 'Built backend services for local community organizations.', isVerified: true },
    { id: crypto.randomUUID(), text: 'Improved delivery workflows and supported developer onboarding workshops.', isVerified: true },
  ];
  const synthesized = 'Built backend services for local community organizations and improved delivery workflows while supporting developer onboarding workshops.';
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.summarySegments = [{ text: synthesized, sourceIds: ['work_1_b1', 'work_1_b2'] }];
    return { body: completed(document) };
  });
  const original = await seed(page, source); await tailor(page);
  await expect.poll(async () => { const s = await stored(page); return s.profiles.find(p => p.profileId === s.activeId)?.summary.data; }).toBe(synthesized);
  await saved(page);
  let state = await stored(page), copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(copy.summary.data).toBe(synthesized);
  expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  checkPreserved(original, copy);
  await expect(page.getByText(/Removed a summary sentence that repeats one experience\/project passage/)).toHaveCount(0);
  await page.reload(); await saved(page);
  state = await stored(page); copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(copy.summary.data).toBe(synthesized);
  expect(await exportedText(page, testInfo)).toContain(synthesized);
  checkWire(sc1Harness);
});

test('job-named omitted source skill survives in the new copy with qualification and review note', async ({ page, sc1Harness }, testInfo) => {
  const source = sourceProfile(false); source.skills.isLocked = false;
  source.skills.data.push({ id: crypto.randomUUID(), name: 'Full-Stack SaaS Architecture', category: 'Technical', level: 'Coursework only' });
  const job = 'Backend engineer: build data dashboards, document work and collaborate. Preferred experience with SaaS applications.';
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.skillSelections = [{ id: 'skill_1', category: 'Technical' }]; // Synthetic model omits the existing SaaS skill.
    return { body: completed(document) };
  });
  const original = await seed(page, source); await tailor(page, job);
  await expect.poll(async () => { const s = await stored(page); return s.activeId !== original.profileId; }).toBe(true);
  await saved(page);
  let state = await stored(page), copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(copy.skills.data.find(s => s.name === 'Full-Stack SaaS Architecture')).toEqual(original.skills.data.find(s => s.name === 'Full-Stack SaaS Architecture'));
  expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/Kept your existing skill.*Full-Stack SaaS Architecture/).first()).toBeVisible();
  await page.reload(); await saved(page);
  state = await stored(page); copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(copy.skills.data.find(s => s.name === 'Full-Stack SaaS Architecture').level).toBe('Coursework only');
  const pdf = await exportedText(page, testInfo);
  expect(pdf).toContain('Full-Stack SaaS Architecture'); expect(pdf).toContain('Coursework only');
  expect(sc1Harness.calls).toHaveLength(1);
});

test('alternative summary survives real app save, reopen and PDF after two copied sentences', async ({ page, sc1Harness }, testInfo) => {
  const source = sourceProfile(false); source.experience.isLocked = false;
  const first = 'Designed and engineered resilient data dashboards and reporting architectures for reporting operations.';
  const second = 'Improved delivery workflows and supported developer onboarding through structured workshops.';
  const alternative = 'Software engineer combining data dashboard design with delivery and developer onboarding support.';
  source.experience.data[0].bullets = [first, second].map(text => ({ id: crypto.randomUUID(), text, isVerified: true }));
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.summarySegments = [{ text: first, sourceIds: ['work_1_b1'] }, { text: second, sourceIds: ['work_1_b2'] }];
    document.alternativeSummarySegments = [{ text: alternative, sourceIds: ['work_1_b1', 'work_1_b2'] }];
    return { body: completed(document) };
  });
  const original = await seed(page, source); await tailor(page);
  await expect.poll(async () => { const s = await stored(page); return s.profiles.find(p => p.profileId === s.activeId)?.summary.data; }).toBe(alternative);
  await saved(page); let state = await stored(page), copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  checkPreserved(original, copy);
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/Used the alternative AI summary because the first did not pass local checks/).first()).toBeVisible();
  await page.reload(); await saved(page);
  state = await stored(page); copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(copy.summary.data).toBe(alternative);
  const pdf = await exportedText(page, testInfo);
  expect(pdf).toContain(alternative); expect(pdf).toContain(first); expect(pdf).toContain(second);
  checkWire(sc1Harness);
});

test('shortened copied summary prefers a checked two-fact alternative when available', async ({ page, sc1Harness }, testInfo) => {
  const source = sourceProfile(false); source.experience.isLocked = false;
  const first = 'Designed and engineered secure software platforms and system architectures, enabling coordinated internal operations.';
  const second = 'Streamlined delivery workflows and development pipelines, reducing processing delays and improving project coordination.';
  const primary = 'Software Engineer experienced in designing and engineering secure software platforms and system architectures.';
  const alternate = 'Software engineer with a background in software platform design, system architecture and delivery workflow improvement.';
  source.experience.data[0].bullets = [first, second].map(text => ({ id: crypto.randomUUID(), text, isVerified: true }));
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.summarySegments = [{ text: primary, sourceIds: ['headline', 'work_1_b1'] }, { text: second, sourceIds: ['work_1_b2'] }];
    document.alternativeSummarySegments = [{ text: alternate, sourceIds: ['headline', 'work_1_b1', 'work_1_b2'] }];
    return { body: completed(document) };
  });
  const original = await seed(page, source); await tailor(page);
  await expect.poll(async () => { const s = await stored(page); return s.profiles.find(p => p.profileId === s.activeId)?.summary.data; }).toBe(alternate);
  await saved(page); let state = await stored(page), copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  checkPreserved(original, copy);
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/first closely echoed one experience passage/).first()).toBeVisible();
  await page.reload(); await saved(page);
  state = await stored(page); copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(copy.summary.data).toBe(alternate);
  const pdf = await exportedText(page, testInfo); expect(pdf).toContain(alternate); expect(pdf).toContain(first); expect(pdf).toContain(second);
  checkWire(sc1Harness);
});

test('job phrase retains an omitted existing skill without changing its qualification or experience', async ({ page, sc1Harness }, testInfo) => {
  const source = sourceProfile(false); source.skills.isLocked = false;
  source.skills.data.push({ id: crypto.randomUUID(), name: 'Problem Solving & Algorithm Design', category: 'Technical', level: 'Coursework only' });
  const job = 'Software engineer: build data dashboards, document work, and use strong problem-solving skills.';
  sc1Harness.respond(packet => { const document = authoredDocument(packet); document.skillSelections = [{ id: 'skill_1', category: 'Technical' }]; return { body: completed(document) }; });
  const original = await seed(page, source); await tailor(page, job);
  await expect.poll(async () => (await stored(page)).activeId !== original.profileId).toBe(true); await saved(page);
  let state = await stored(page), copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  expect(copy.skills.data.find(s => s.name === 'Problem Solving & Algorithm Design')).toEqual(original.skills.data[1]);
  expect(copy.experience).toEqual(original.experience);
  await page.reload(); await saved(page); state = await stored(page); copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(copy.skills.data.find(s => s.name === 'Problem Solving & Algorithm Design').level).toBe('Coursework only');
  const pdf = await exportedText(page, testInfo); expect(pdf).toContain('Problem Solving & Algorithm Design'); expect(pdf).toContain('Coursework only');
  expect(sc1Harness.calls).toHaveLength(1);
});

test('a reversed limitation restores the original through save, reopen and PDF', async ({ page, sc1Harness }, testInfo) => {
  const source = sourceProfile(false); source.experience.isLocked = false;
  const originalText = 'Assisted with classroom web application testing; did not deploy production systems.';
  source.experience.data[0].bullets = [originalText, 'Wrote documentation for classroom projects.'].map(text => ({ id: crypto.randomUUID(), text, isVerified: true }));
  const generated = 'Deployed data dashboards to production.';
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.summarySegments = [{ text: 'Experience writing classroom project documentation.', sourceIds: ['work_1_b2'] }];
    document.entries[0].bullets[0] = { text: generated, sourceIds: ['work_1_b1'] };
    return { body: completed(document) };
  });
  const original = await seed(page, source); await tailor(page, JOB);
  await expect.poll(async () => (await stored(page)).activeId !== original.profileId).toBe(true); await saved(page);
  let state = await stored(page), copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(state.profiles.find(p => p.profileId === original.profileId)).toEqual(original);
  expect(copy.experience.data[0].bullets[0].text).toBe(originalText);
  expect(copy.compositionReview.notes.some(n => n.includes('limitation') && n.includes('may have been lost'))).toBe(true);
  await page.reload(); await saved(page); state = await stored(page); copy = state.profiles.find(p => p.profileId === state.activeId);
  expect(copy.experience.data[0].bullets[0].text).toBe(originalText);
  expect(copy.compositionReview.notes.some(n => n.includes('limitation'))).toBe(true);
  const pdf = await exportedText(page, testInfo); expect(pdf).toContain('did not deploy production systems'); expect(pdf).not.toContain(generated);
  expect(sc1Harness.calls).toHaveLength(1);
});

test('change report distinguishes reordered work and omitted skills across reload and PDF', async ({ page, sc1Harness }, testInfo) => {
  const p = sourceProfile(false); p.experience.isLocked = false; p.skills.isLocked = false;
  p.experience.data[0].bullets.push({ id: crypto.randomUUID(), text: 'Wrote documentation for classroom projects.', isVerified: true });
  p.skills.data.push({ id: crypto.randomUUID(), name: 'Digital Advertising', category: 'Technical', level: 'Coursework only' });
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet), facts = new Map(packet.source.evidence.map(f => [f.id, f]));
    document.entries[0].bullets = packet.source.experience[0].bulletIds.map(id => ({ text: facts.get(id).text, sourceIds: [id] })).reverse();
    document.skillSelections = [{ id: 'skill_1', category: 'Technical' }];
    return { body: completed(document) };
  });
  const original = await seed(page, p); await tailor(page);
  await expect(page.getByText('A new editable copy is open.', { exact: false })).toBeVisible();
  await expect(page.getByText('Summary: Wording changed.', { exact: true })).toBeVisible();
  await expect(page.getByText('Experience: Wording unchanged; order changed.', { exact: true })).toBeVisible();
  await expect(page.getByText('Skills: 1 retained; 1 not selected for this copy.', { exact: true })).toBeVisible();
  await page.getByText('Skills not selected for this copy', { exact: true }).click();
  await expect(page.getByText('Digital Advertising — Coursework only', { exact: true })).toBeVisible();
  await saved(page);
  let state = await stored(page); const copy = state.profiles.find(profile => profile.profileId === state.activeId);
  expect(state.profiles.find(profile => profile.profileId === original.profileId)).toEqual(original);
  expect(copy.compositionChanges.experience).toBe('reordered');
  await page.reload(); await saved(page);
  await expect(page.getByText('Experience: Wording unchanged; order changed.', { exact: true })).toBeVisible();
  await page.getByText('Skills not selected for this copy', { exact: true }).click();
  await expect(page.getByText('Digital Advertising — Coursework only', { exact: true })).toBeVisible();
  state = await stored(page); expect(state.profiles.find(profile => profile.profileId === original.profileId)).toEqual(original);
  const pdf = await exportedText(page, testInfo);
  expect(pdf).not.toContain('Digital Advertising'); expect(pdf).not.toContain('What changed during tailoring');
  expect(pdf).toContain('Wrote documentation for classroom projects.'); checkWire(sc1Harness);
});

test('lost assistance qualification restores original, while a supported edit survives save and PDF', async ({ page, sc1Harness }, testInfo) => {
  const p = sourceProfile(true);
  p.experience.data[0].bullets[0].text = 'Assisted developers with testing data dashboards.';
  p.experience.data[0].bullets.push({ id: crypto.randomUUID(), text: EDITED_SUMMARY, isVerified: true });
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.entries[0].bullets[0].text = 'Tested data dashboards.';
    return { body: completed(document) };
  });
  const original = await seed(page, p); await tailor(page);
  await expect(page.getByText('A new editable copy is open.', { exact: false })).toBeVisible();
  await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/a supporting role that may have been lost/).first()).toBeVisible();
  await saved(page); let state = await stored(page), copy = state.profiles.find(x => x.profileId === state.activeId);
  expect(state.profiles.find(x => x.profileId === original.profileId)).toEqual(original);
  expect(copy.experience.data[0].bullets.map(x=>x.text)).toEqual(['Assisted developers with testing data dashboards.', 'Developed internal data dashboards for a classroom exercise.']);
  await page.reload(); await saved(page); await page.getByText(/Review 1 content note/).click();
  await expect(page.getByText(/a supporting role that may have been lost/).first()).toBeVisible();
  state = await stored(page); expect(state.profiles.find(x => x.profileId === original.profileId)).toEqual(original);
  const pdf = await exportedText(page, testInfo);
  expect(pdf).toContain('Assisted developers with testing data dashboards.');
  expect(pdf).toContain('Developed internal data dashboards for a classroom exercise.');
  expect(pdf).not.toContain('a supporting role that may have been lost'); checkWire(sc1Harness);
});

test('overlapping rejected and accepted lines do not duplicate a contribution in saved copy or PDF', async ({ page, sc1Harness }, testInfo) => {
  const p = sourceProfile(true);
  const first = 'Built internal data dashboards for a classroom exercise.';
  p.experience.data[0].bullets[0].text = first;
  p.experience.data[0].bullets.push({ id: crypto.randomUUID(), text: 'Wrote technical documentation.', isVerified: true });
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.entries[0].bullets = [
      { text: 'Developed internal data dashboards for a classroom exercise.', sourceIds: ['work_1_b1'] },
      { text: 'Built internal data dashboards using Kubernetes for a classroom exercise.', sourceIds: ['work_1_b1'] },
      { text: 'Created technical documentation.', sourceIds: ['work_1_b2'] },
    ];
    return { body: completed(document) };
  });
  const original = await seed(page, p); await tailor(page);
  await expect(page.getByText('A new editable copy is open.', { exact: false })).toBeVisible();
  await saved(page); let state = await stored(page), copy = state.profiles.find(x => x.profileId === state.activeId);
  expect(state.profiles.find(x => x.profileId === original.profileId)).toEqual(original);
  expect(copy.experience.data[0].bullets.map(x => x.text)).toEqual([first, 'Created technical documentation.']);
  expect(copy.compositionReview.notes.some(n => n.includes('overlapping source passages'))).toBe(true);
  await page.reload(); await saved(page); state = await stored(page);
  copy = state.profiles.find(x => x.profileId === state.activeId);
  expect(copy.experience.data[0].bullets.map(x => x.text)).toEqual([first, 'Created technical documentation.']);
  const pdf = await exportedText(page, testInfo);
  expect(pdf).toContain(first); expect(pdf).toContain('Created technical documentation.');
  expect(pdf).not.toContain('Developed internal data dashboards for a classroom exercise.');
  expect(pdf).not.toContain('Built internal data dashboards using Kubernetes for a classroom exercise.');
  expect(pdf).not.toContain('overlapping source passages');
  checkWire(sc1Harness);
});

test('local comparison distinguishes proposed rewrite from restored result without storing raw text', async ({ page, sc1Harness }, testInfo) => {
  const p = sourceProfile(true), originalText = EDITED_SUMMARY;
  p.experience.data[0].bullets.push({ id: crypto.randomUUID(), text: 'Wrote technical documentation.', isVerified: true });
  sc1Harness.respond(packet => {
    const document = authoredDocument(packet);
    document.entries[0].bullets = [
      { text: 'Wrote technical documentation.', sourceIds: ['work_1_b2'] },
      { text: 'Built internal data dashboards using Kubernetes for a classroom exercise.', sourceIds: ['work_1_b1'] },
    ];
    return { body: completed(document) };
  });
  const original = await seed(page, p); await tailor(page); await saved(page);
  const explanation = 'Before local checks, the AI proposed 2 work/project bullet lines; 1 did not exactly match a source passage in the same entry. These counts cover the first response for each unlocked entry, not quality or accuracy.';
  await expect(page.getByText(explanation)).toBeVisible();
  await expect.poll(async () => (await stored(page)).activeId).not.toBe(original.profileId);
  let state = await stored(page), copy = state.profiles.find(x => x.profileId === state.activeId);
  expect(state.profiles.find(x => x.profileId === original.profileId)).toEqual(original);
  expect(copy.experience.data[0].bullets.map(x => x.text)).toEqual(['Wrote technical documentation.', originalText]);
  expect(copy.compositionChanges.proposal).toEqual({ proposed: 2, different: 1 });
  expect(JSON.stringify(copy)).not.toContain('Built internal data dashboards using Kubernetes for a classroom exercise.');
  await page.reload(); await saved(page); await expect(page.getByText(explanation)).toBeVisible();
  const pdf = await exportedText(page, testInfo);
  expect(pdf).not.toContain('Before local checks'); expect(pdf).toContain(originalText);
  checkWire(sc1Harness);
});
