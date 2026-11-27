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
    .replaceAll('import.meta.env.VITE_GEMINI_API_KEY', "''");
  m._compile(ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file);
  return m.exports;
}

const { compareJobMatch, reconstructBaselineProfile } = load('services/resumeComposer/jobMatch');
const { formatReviewNote } = load('components/builder/reviewCopy');
const { fixture } = require('./helpers/composer-editorial-v4-fixture.cjs');

test('compareJobMatch and reconstructBaselineProfile measure Before->After narrative lift accurately', () => {
  const before = fixture();
  before.summary.data = 'Software engineer building web apps.';
  before.skills.data = [
    { id: '00000000-0000-4000-8000-000000000301', name: 'PHP (Laravel)', category: 'Languages' },
    { id: '00000000-0000-4000-8000-000000000302', name: 'MySQL', category: 'Tools' },
    { id: '00000000-0000-4000-8000-000000000303', name: 'RESTful APIs', category: 'Technical' },
  ];

  const after = JSON.parse(JSON.stringify(before));
  after.summary.data = 'Software engineer designing scalable web applications. Core technical toolkit includes PHP (Laravel), MySQL, and RESTful APIs.';
  after.compositionSnapshot = {
    headline: 'Software Engineer',
    summary: before.summary.data,
    experience: before.experience.data.map(e => ({ id: e.id, description: e.description ?? '', bullets: e.bullets.map(b => ({ id: b.id, text: b.text })) })),
    projects: before.projects.data.map(p => ({ id: p.id, bullets: p.bullets.map(b => ({ id: b.id, text: b.text })) })),
    skills: before.skills.data.map(s => ({ ...s })),
  };

  const job = 'Backend Software Engineer building RESTful APIs with PHP, Laravel, MySQL, and Docker.';
  const reconstructed = reconstructBaselineProfile(after);
  assert.ok(reconstructed);
  const cmp = compareJobMatch(reconstructed, after, job);
  assert.ok(cmp.matchedDelta >= 3);
  assert.ok(cmp.newlyDemonstrated.includes('PHP'));
  assert.ok(cmp.newlyDemonstrated.includes('MySQL'));
  assert.ok(cmp.newlyDemonstrated.includes('RESTful APIs'));
  assert.ok(cmp.after.missing.includes('Docker'));
});

test('formatReviewNote turns internal compiler paths into human-friendly labels', () => {
  const p = fixture();
  p.experience.data[0].roleTitle = 'Software Engineer';
  p.experience.data[0].companyName = 'CyberX Studio';

  assert.equal(
    formatReviewNote('summarySegments.0: Removed a duplicate sentence.', p),
    'Profile: Removed a duplicate sentence.',
  );
  assert.equal(
    formatReviewNote('skillSelections: Grouped your existing skill under Technical.', p),
    'Skills: Grouped your existing skill under Technical.',
  );
  assert.equal(
    formatReviewNote('entries.work_1.bullets.2: Kept original wording.', p),
    'Experience (Software Engineer · CyberX Studio): Kept original wording.',
  );
  assert.equal(
    formatReviewNote('Plain review note without path.', p),
    'Plain review note without path.',
  );
});
