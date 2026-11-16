const { test, expect } = require('@playwright/test');
const { load } = require('../helpers/editorial-loader.cjs');
const { createSampleProfile } = load('mock/profile');

const PROFILE_KEY = 'cv-tailor-profiles-v2';
const ACTIVE_KEY = 'cv-tailor-active-id-v2';

async function openAndSeed(page, source) {
  await page.goto('/');
  await expect(page.getByText('Saved in this browser', { exact: true })).toBeVisible();
  await page.evaluate(async ({ source, profileKey, activeKey }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('keyval', 'readwrite'), store = tx.objectStore('keyval');
        store.put([source], profileKey); store.put(source.profileId, activeKey);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { source, profileKey: PROFILE_KEY, activeKey: ACTIVE_KEY });
  await page.reload();
  await expect(page.getByLabel('Resume document name')).toHaveValue(source.profileName);
}

test('legacy tailored copy renders the advisory professional review checklist', async ({ page }) => {
  const source = createSampleProfile('Checklist Legacy Source');
  const normalizedSource = await (async () => {
    await openAndSeed(page, source);
    return page.evaluate(async ({ profileKey }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('keyval-store', 1);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction('keyval', 'readonly'), request = tx.objectStore('keyval').get(profileKey);
          request.onsuccess = () => resolve(request.result[0]); request.onerror = () => reject(request.error);
        });
      } finally { db.close(); }
    }, { profileKey: PROFILE_KEY });
  })();
  const legacy = JSON.parse(JSON.stringify(normalizedSource));
  legacy.profileId = crypto.randomUUID();
  legacy.baseProfileId = normalizedSource.profileId;
  legacy.profileName = 'Checklist Legacy Copy';
  legacy.targetJob = 'Fictional job description for browser coverage.';
  legacy.tailoring = {
    sourceProfileId: normalizedSource.profileId,
    requestKey: 'a'.repeat(64),
    jobTitle: 'Fictional role', company: 'Fictional organization',
    createdAt: new Date().toISOString(), model: 'gemini-2.5-flash',
    warnings: [], missingRequirements: [], requirements: [], changes: [], summaryEvidence: [],
  };
  delete legacy.compositionChanges;
  await page.evaluate(async ({ profiles, activeId, profileKey, activeKey }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('keyval', 'readwrite'), store = tx.objectStore('keyval');
        store.put(profiles, profileKey); store.put(activeId, activeKey);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { profiles: [normalizedSource, legacy], activeId: legacy.profileId, profileKey: PROFILE_KEY, activeKey: ACTIVE_KEY });
  await page.reload();
  await expect(page.getByText('Professional review checklist', { exact: true })).toBeVisible();
  await expect(page.getByText(/older tailored copy may have incomplete historical comparison metadata/)).toBeVisible();
  for (const label of ['Truth and scope', 'Job relevance', 'Coverage', 'Clarity', 'User control', 'Preview and export']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  const older = JSON.parse(JSON.stringify(normalizedSource));
  older.profileId = crypto.randomUUID();
  older.baseProfileId = normalizedSource.profileId;
  older.profileName = 'Checklist Older Copy';
  older.targetJob = 'Fictional older tailoring job';
  older.matchScore = 0.5;
  delete older.tailoring; delete older.compositionChanges;
  await page.evaluate(async ({ profiles, activeId, profileKey, activeKey }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('keyval', 'readwrite'), store = tx.objectStore('keyval');
        store.put(profiles, profileKey); store.put(activeId, activeKey);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { profiles: [normalizedSource, legacy, older], activeId: older.profileId, profileKey: PROFILE_KEY, activeKey: ACTIVE_KEY });
  await page.reload();
  await expect(page.getByText('Professional review checklist', { exact: true })).toBeVisible();

  const ordinary = JSON.parse(JSON.stringify(normalizedSource));
  ordinary.profileId = crypto.randomUUID();
  ordinary.baseProfileId = normalizedSource.profileId;
  ordinary.profileName = 'Checklist Ordinary Duplicate';
  delete ordinary.targetJob; delete ordinary.matchScore; delete ordinary.tailoring; delete ordinary.compositionChanges;
  await page.evaluate(async ({ profiles, activeId, profileKey, activeKey }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('keyval', 'readwrite'), store = tx.objectStore('keyval');
        store.put(profiles, profileKey); store.put(activeId, activeKey);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { profiles: [normalizedSource, legacy, older, ordinary], activeId: ordinary.profileId, profileKey: PROFILE_KEY, activeKey: ACTIVE_KEY });
  await page.reload();
  await expect(page.getByText('Professional review checklist', { exact: true })).toHaveCount(0);
});
