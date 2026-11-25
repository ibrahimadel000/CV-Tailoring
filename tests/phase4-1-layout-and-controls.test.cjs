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
    .replaceAll('import.meta.env.DEV', 'true')
    .replaceAll('import.meta.env.VITE_GEMINI_API_KEY', "'synthetic-offline-key'");
  m._compile(ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file);
  return m.exports;
}

const { documentThemeSchema } = load('types/schema');
const { themeMetrics } = load('components/builder/resumeModel');
const { requestComposition, TAILORING_STYLES } = load('services/resumeComposer/request');
const { prepareNaturalComposition } = load('services/resumeComposer/naturalDocument');
const { createSampleProfile } = load('mock/profile');

test('documentThemeSchema stays backward-compatible with 5-key themes and accepts fitOnePage/compactCertifications', () => {
  const legacy = { accentColor: '#2563eb', fontFamily: 'sans', fontSize: 'medium', lineSpacing: 'normal', layoutStyle: 'modern' };
  const parsedLegacy = documentThemeSchema.safeParse(legacy);
  assert.equal(parsedLegacy.success, true);
  assert.equal('fitOnePage' in parsedLegacy.data, false);

  const modern = { ...legacy, fitOnePage: true, compactCertifications: true };
  const parsedModern = documentThemeSchema.safeParse(modern);
  assert.equal(parsedModern.success, true);
  assert.equal(parsedModern.data.fitOnePage, true);
  assert.equal(parsedModern.data.compactCertifications, true);
});

test('themeMetrics tightens density when fitOnePage is true without altering defaults', () => {
  const base = { accentColor: '#2563eb', fontFamily: 'sans', fontSize: 'medium', lineSpacing: 'normal', layoutStyle: 'modern' };
  const normal = themeMetrics(base);
  const fit = themeMetrics({ ...base, fitOnePage: true });
  assert.equal(normal.size, 11);
  assert.equal(normal.margin, 42);
  assert.ok(fit.size < normal.size);
  assert.ok(fit.margin < normal.margin);
  assert.ok(fit.leading < normal.leading);
});

test('requestComposition appends style guidance only for non-balanced tailoring styles', async () => {
  assert.deepEqual(TAILORING_STYLES.map(s => s.id), ['balanced', 'concise', 'impact']);
  const p = createSampleProfile('Style check');
  const packet = prepareNaturalComposition(p, 'Software Engineer role building scalable web applications and APIs.');
  const oldFetch = global.fetch;
  let capturedSystem = '';
  try {
    global.fetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      capturedSystem = body.systemInstruction.parts[0].text;
      return {
        ok: true,
        json: async () => ({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ summarySegments: [], entries: [], skillSelections: [] }) }] } }],
        }),
      };
    };
    await requestComposition(packet, new AbortController().signal, 'gemini-3.8-flash', 'concise');
    assert.match(capturedSystem, /STYLE PREFERENCE \(Concise\)/);

    await requestComposition(packet, new AbortController().signal, 'gemini-3.8-flash', 'impact');
    assert.match(capturedSystem, /STYLE PREFERENCE \(Impact-focused\)/);

    await requestComposition(packet, new AbortController().signal, 'gemini-3.8-flash', 'balanced');
    assert.doesNotMatch(capturedSystem, /STYLE PREFERENCE/);
  } finally {
    global.fetch = oldFetch;
  }
});
