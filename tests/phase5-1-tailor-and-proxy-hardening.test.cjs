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

const { analyzeJobMatch } = load('services/resumeComposer/jobMatch');
const { cvProfileSchema } = load('types/schema');
const { createSampleProfile } = load('mock/profile');

test('analyzeJobMatch handles clause-level negation, sentence-initial Go, separate HTML/CSS, and customSections', () => {
  const p = createSampleProfile('Pass A Match');
  p.summary.data = 'Frontend Engineer.';
  p.experience.data = [{
    id: crypto.randomUUID(),
    roleTitle: 'Frontend Engineer',
    companyName: 'WebCo',
    startDate: '2024',
    endDate: '2026',
    bullets: [{ id: crypto.randomUUID(), text: 'Built semantic HTML pages and automated Python scripts.', isVerified: true }],
  }];
  p.projects.data = [];
  p.skills.data = [{ id: crypto.randomUUID(), name: 'SQL', category: 'Languages' }];
  p.certifications.data = [];
  p.customSections = [
    { id: crypto.randomUUID(), title: 'Open Source', kind: 'list', paragraphs: ['Maintainer on GitHub using Terraform'] },
    { id: crypto.randomUUID(), title: 'Imported details', kind: 'text', paragraphs: ['Docker'] },
  ];

  const job = 'Go beyond expectations! Strong Python and SQL required, no prior Kubernetes experience required. Also need HTML, CSS, Git, Terraform, and Docker.';
  const res = analyzeJobMatch(p, job);

  assert.ok(res.matched.includes('Python'));
  assert.ok(res.matched.includes('HTML'));
  assert.ok(res.listed.includes('SQL'));
  assert.ok(res.listed.includes('Git'));
  assert.ok(res.listed.includes('Terraform'));
  assert.ok(res.missing.includes('CSS'));
  // Imported details must stay excluded from match scanning.
  assert.ok(res.missing.includes('Docker'));
  assert.equal(res.missing.includes('Kubernetes'), false);
  assert.equal(res.missing.includes('Go'), false);
});

test('compositionSnapshotSchema supports optional description and bulletOriginMap', () => {
  const p = createSampleProfile('Snapshot Origin Map');
  p.compositionSnapshot = {
    summary: p.summary.data,
    experience: p.experience.data.map(e => ({
      id: e.id,
      description: e.description ?? '',
      bullets: e.bullets.map(b => ({ id: b.id, text: b.text })),
    })),
    projects: [],
    skills: p.skills.data.map(s => ({ ...s })),
    bulletOriginMap: { 'new-tailored-uuid': [p.experience.data[0].bullets[0].id] },
  };
  assert.equal(cvProfileSchema.safeParse(p).success, true);
});
