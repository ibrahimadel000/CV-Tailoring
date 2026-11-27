if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(rel) {
  const file = path.resolve(root, 'src', rel + '.ts');
  if (cache.has(file)) return cache.get(file).exports;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(root);
  const normal = m.require.bind(m);
  m.require = id => {
    if (id.startsWith('@/')) return load(id.slice(2));
    if (id.startsWith('.')) {
      const target = path.resolve(path.dirname(file), id + '.ts');
      if (fs.existsSync(target)) return load(path.relative(path.join(root, 'src'), target).replace(/\.ts$/, ''));
    }
    return normal(id);
  };
  cache.set(file, m);
  const src = fs.readFileSync(file, 'utf8')
    .replaceAll('import.meta.env.DEV', 'false')
    .replaceAll('import.meta.env.VITE_GEMINI_API_KEY', "''")
    .replaceAll('import.meta.url', "'file:///local/'");
  m._compile(ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file);
  return m.exports;
}

const {
  MAX_HISTORY_ENTRIES,
  HISTORY_COALESCE_MS,
  createHistoryState,
  inferCoalesceKey,
  recordProfileEdit,
  undoProfileEdit,
  redoProfileEdit,
  clearProfileHistory,
  getHistoryFlags,
} = load('store/history');
const { useAppStore } = load('store/useAppStore');
const { fixture } = require('./helpers/composer-editorial-v4-fixture.cjs');

test('history engine coalesces rapid same-section edits and separates different sections or pauses', () => {
  const p0 = fixture();
  const p1 = { ...p0, summary: { ...p0.summary, data: 'A' } };
  const p2 = { ...p0, summary: { ...p0.summary, data: 'AB' } };
  const p3 = { ...p0, summary: { ...p0.summary, data: 'ABC' } };
  const p4 = { ...p3, headline: { ...p3.headline, data: 'Operations Lead' } };

  let h = createHistoryState();
  h = recordProfileEdit(h, p0, p1, { now: 1000 });
  h = recordProfileEdit(h, p1, p2, { now: 1200 });
  h = recordProfileEdit(h, p2, p3, { now: 1400 });
  assert.equal(h[p0.profileId].past.length, 1);

  h = recordProfileEdit(h, p3, p4, { now: 1500 });
  assert.equal(h[p0.profileId].past.length, 2);

  const u1 = undoProfileEdit(h, p4);
  assert.equal(u1.restored.headline.data, p3.headline.data);
  assert.equal(u1.restored.summary.data, 'ABC');
  const u2 = undoProfileEdit(u1.history, u1.restored);
  assert.equal(u2.restored.summary.data, p0.summary.data);

  const r1 = redoProfileEdit(u2.history, u2.restored);
  assert.equal(r1.restored.summary.data, 'ABC');

  const p5 = { ...p3, summary: { ...p3.summary, data: 'ABCD' } };
  const afterPause = recordProfileEdit(h, p4, p5, { now: 1500 + HISTORY_COALESCE_MS + 100 });
  assert.equal(afterPause[p0.profileId].past.length, 3);
});

test('history engine never coalesces structural additions/deletions or section drag reorders and enforces 200-step cap', () => {
  const p0 = fixture();
  const pDel = {
    ...p0,
    experience: {
      ...p0.experience,
      data: p0.experience.data.map((e, idx) => (idx === 0 ? { ...e, bullets: e.bullets.slice(1) } : e)),
    },
  };
  assert.equal(inferCoalesceKey(p0, pDel), null);

  const pReorder = { ...p0, sectionOrder: ['skills', 'experience', 'education'] };
  assert.equal(inferCoalesceKey(p0, pReorder), null);

  let h = createHistoryState();
  let cur = p0;
  for (let i = 1; i <= MAX_HISTORY_ENTRIES + 15; i++) {
    const next = { ...cur, summary: { ...cur.summary, data: `edit-${i}` } };
    h = recordProfileEdit(h, cur, next, { now: i * 5000, coalesceKey: null });
    cur = next;
  }
  assert.equal(h[p0.profileId].past.length, MAX_HISTORY_ENTRIES);
  assert.deepEqual(getHistoryFlags(h, p0.profileId), { canUndo: true, canRedo: false });
  h = clearProfileHistory(h, p0.profileId);
  assert.deepEqual(getHistoryFlags(h, p0.profileId), { canUndo: false, canRedo: false });
});

test('useAppStore records atomic undo/redo across actions, direct setState, theme changes (ignoring no-ops), and soft-delete restore', () => {
  const id1 = useAppStore.getState().createProfile('First Resume');
  const id2 = useAppStore.getState().createProfile('Second Resume');
  useAppStore.getState().setActiveProfile(id1);

  assert.equal(useAppStore.getState().canUndo, false);

  // Verify single atomic subscriber delivery (no out-of-order re-entrant setState)
  const observedFlags = [];
  const unsub = useAppStore.subscribe((state) => {
    observedFlags.push({ canUndo: state.canUndo, summary: state.profiles.find(p => p.profileId === id1)?.summary.data });
  });
  useAppStore.getState().updateSummary('Initial summary');
  unsub();
  assert.equal(observedFlags.length, 1);
  assert.deepEqual(observedFlags[0], { canUndo: true, summary: 'Initial summary' });

  // No-op setDocumentTheme does NOT record a spurious undo step
  const prevTheme = { ...useAppStore.getState().documentTheme };
  useAppStore.getState().setDocumentTheme({ layoutStyle: prevTheme.layoutStyle });
  useAppStore.getState().setDocumentTheme({ layoutStyle: 'classic' });
  assert.equal(useAppStore.getState().documentTheme.layoutStyle, 'classic');

  // Direct setState mutation (like SectionEditor / useSectionDrag) is also tracked
  useAppStore.setState(state => ({
    profiles: state.profiles.map(p => (p.profileId === id1 ? { ...p, sectionOrder: ['skills', 'experience'] } : p)),
  }));
  assert.deepEqual(useAppStore.getState().profiles.find(p => p.profileId === id1).sectionOrder, ['skills', 'experience']);

  // Undo reverts sectionOrder -> classic theme -> summary
  assert.equal(useAppStore.getState().undo(), true);
  assert.equal(useAppStore.getState().profiles.find(p => p.profileId === id1).sectionOrder, undefined);
  assert.equal(useAppStore.getState().documentTheme.layoutStyle, 'classic');

  assert.equal(useAppStore.getState().undo(), true);
  assert.equal(useAppStore.getState().documentTheme.layoutStyle, prevTheme.layoutStyle);

  assert.equal(useAppStore.getState().undo(), true);
  assert.equal(useAppStore.getState().profiles.find(p => p.profileId === id1).summary.data, '');

  // Redo steps forward cleanly
  assert.equal(useAppStore.getState().redo(), true);
  assert.equal(useAppStore.getState().profiles.find(p => p.profileId === id1).summary.data, 'Initial summary');
  assert.equal(useAppStore.getState().redo(), true);
  assert.equal(useAppStore.getState().documentTheme.layoutStyle, 'classic');

  // Switching profiles updates canUndo/canRedo for the selected profile
  useAppStore.getState().setActiveProfile(id2);
  assert.equal(useAppStore.getState().canUndo, false);

  // Soft-delete profile + expectedProfileId guard + restore + clearDeletedProfile
  const beforeCount = useAppStore.getState().profiles.length;
  const origIndex = useAppStore.getState().profiles.findIndex(p => p.profileId === id1);
  useAppStore.getState().deleteProfile(id1);
  assert.equal(useAppStore.getState().profiles.length, beforeCount - 1);
  assert.equal(useAppStore.getState().restoreDeletedProfile('wrong-id'), false);
  assert.equal(useAppStore.getState().restoreDeletedProfile(id1), true);
  assert.equal(useAppStore.getState().profiles.length, beforeCount);
  assert.equal(useAppStore.getState().profiles.findIndex(p => p.profileId === id1), origIndex);
  assert.equal(useAppStore.getState().activeProfileId, id1);
  assert.equal(useAppStore.getState().lastDeletedProfile, null);

  useAppStore.getState().deleteProfile(id2);
  assert.ok(useAppStore.getState().lastDeletedProfile);
  useAppStore.getState().clearDeletedProfile();
  assert.equal(useAppStore.getState().lastDeletedProfile, null);
});

test('BuilderStudio and useBuilderPersistence harden dialog undo banner, shortcuts, mount hydration, and reload race', () => {
  const studioSrc = fs.readFileSync(path.join(root, 'src/components/builder/BuilderStudio.tsx'), 'utf8');
  assert.ok(studioSrc.includes('aria-label="Undo"'));
  assert.ok(studioSrc.includes('aria-label="Redo"'));
  assert.ok(studioSrc.includes('library-undo-banner'));
  assert.ok(studioSrc.includes("document.querySelector('dialog[open]')"));
  assert.ok(studioSrc.includes('event.ctrlKey && !event.metaKey && key === \'y\''));
  assert.ok(studioSrc.includes('Reload latest'));
  assert.ok(studioSrc.includes('Keep editing here'));

  const persistSrc = fs.readFileSync(path.join(root, 'src/components/builder/useBuilderPersistence.ts'), 'utf8');
  assert.ok(persistSrc.includes('BroadcastChannel'));
  assert.ok(persistSrc.includes('let reloading = false;'));
  assert.ok(persistSrc.includes('if (needsPersist)'));
  assert.ok(persistSrc.includes('scheduleSave(false)'));
  assert.ok(persistSrc.includes('await queue.catch(() => {})'));
});
