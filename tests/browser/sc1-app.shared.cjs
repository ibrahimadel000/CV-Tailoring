// Offline app-path acceptance, NOT a model response or a writing-quality verdict.
const { test: base, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { load } = require('../helpers/editorial-loader.cjs');
const { createSampleProfile } = load('mock/profile');

const ORIGIN = 'http://127.0.0.1:4187';
const PROVIDER_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
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
      if ([PROVIDER_URL, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'].includes(url) && request.method() === 'POST') {
        const body = request.postDataJSON();
        calls.push({ url, body, headers: request.headers() });
        try {
          const response = await reply(JSON.parse(body.contents[0].parts[0].text));
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
async function acceptProviderConsent(page) {
  await page.getByRole('checkbox', { name: /I understand that the current professional resume content and this job description will be sent to Google/ }).check();
}
async function tailor(page, job = JOB) {
  await expect(page.getByText('Single-draft preview · Gemini 3.8 Flash · experimental', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Job description', { exact: true }).fill(job);
  await acceptProviderConsent(page); await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
}
function checkWire(sc1Harness) {
  expect(sc1Harness.calls).toHaveLength(1);
  const { body, headers } = sc1Harness.calls[0];
  expect(headers['x-goog-api-key']).toBe('synthetic-offline-sc1-key');
  expect(body.generationConfig).toEqual({ responseMimeType: 'application/json', responseSchema: expect.any(Object), maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'medium' } });
  expect(body.systemInstruction.parts[0].text).toContain('one focused, readable resume');
  expect(body.systemInstruction.parts[0].text).toContain('A listed skill does not prove');
  expect(body.systemInstruction.parts[0].text).toContain('do not imply the candidate performed work on the thing being coordinated with');
  expect(body.systemInstruction.parts[0].text).not.toContain('Coordinated laboratory maintenance and cross-team planning to align clinic schedules.');
  expect(body.systemInstruction.parts[0].text).toContain('not independent proof');
  const packet = JSON.parse(body.contents[0].parts[0].text);
  expect(packet.job).toBe(JOB);
  expect(packet.guide.primaryFactIds).toBeDefined();
  expect(packet.referencePolicy).toBeDefined();
  expect(packet.documentBrief).toBeUndefined();
  expect(packet.outputContract).toBeUndefined();
  expect(body.generationConfig.responseSchema.required).toEqual(['summarySegments', 'entries', 'skillSelections']);
  expect(body.generationConfig.responseSchema.properties.alternativeEntries).toBeUndefined();
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


module.exports = { test, expect, fs, createSampleProfile, ORIGIN, PROVIDER_URL, JOB, NARRATIVE_SUMMARY, GENERATED_SUMMARY, EDITED_SUMMARY, ERROR_503, PROFILE_KEY, ACTIVE_KEY, sourceProfile, authoredDocument, completed, stored, saved, seed, acceptProviderConsent, tailor, checkWire, checkPreserved, exportedText };
