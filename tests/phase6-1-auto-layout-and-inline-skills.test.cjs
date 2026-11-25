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

const { autoOptimizeTheme, estimateResumePages } = load('services/autoLayout');
const { createSampleProfile } = load('mock/profile');

const baseTheme = {
  accentColor: '#2557a7',
  fontFamily: 'sans',
  fontSize: 'medium',
  lineSpacing: 'normal',
  layoutStyle: 'modern',
};

test('autoOptimizeTheme enables compactCertifications for >=4 certs and fitOnePage for borderline 2-page spills without mutating baseTheme', () => {
  const p = createSampleProfile('Borderline 2-page');
  p.experience.data = p.experience.data.slice(0, 2);
  p.projects.data = [];
  p.certifications.data = [
    { id: crypto.randomUUID(), name: 'Cert 1', issuer: 'Org A', date: '2025' },
    { id: crypto.randomUUID(), name: 'Cert 2', issuer: 'Org B', date: '2024' },
    { id: crypto.randomUUID(), name: 'Cert 3', issuer: 'Org C', date: '2024' },
    { id: crypto.randomUUID(), name: 'Cert 4', issuer: 'Org D', date: '2023' },
    { id: crypto.randomUUID(), name: 'Cert 5', issuer: 'Org E', date: '2023' },
    { id: crypto.randomUUID(), name: 'Cert 6', issuer: 'Org F', date: '2022' },
  ];
  // Add a few experience bullets so the resume lands in the borderline 1.05-1.40 page spill zone.
  p.experience.data[0].bullets = [
    { id: crypto.randomUUID(), text: 'Engineered scalable backend services and RESTful APIs supporting high-throughput web applications.', isVerified: true },
    { id: crypto.randomUUID(), text: 'Streamlined operational workflows and CI/CD pipelines to reduce technical overhead across engineering teams.', isVerified: true },
    { id: crypto.randomUUID(), text: 'Collaborated with cross-functional business and technical teams to align system architecture with product goals.', isVerified: true },
    { id: crypto.randomUUID(), text: 'Conducted technical workshops and structured onboarding sessions to accelerate developer productivity.', isVerified: true },
  ];

  const themeSnapshot = JSON.stringify(baseTheme);
  const res = autoOptimizeTheme(p, baseTheme);

  assert.equal(JSON.stringify(baseTheme), themeSnapshot);
  assert.equal(res.theme.compactCertifications, true);
  assert.equal(res.theme.fitOnePage, true);
  assert.ok(res.applied.includes('compactCertifications'));
  assert.ok(res.applied.includes('fitOnePage'));
  assert.ok(res.estimatedPagesAfter < res.estimatedPagesBefore);
});

test('autoOptimizeTheme does not crush genuinely dense 2+ page senior resumes into fitOnePage', () => {
  const p = createSampleProfile('Dense Senior CV');
  p.certifications.data = [];
  p.experience.data = Array.from({ length: 6 }, (_, i) => ({
    id: crypto.randomUUID(),
    roleTitle: `Senior Staff Engineer ${i + 1}`,
    companyName: `Company ${i + 1}`,
    startDate: '2020',
    endDate: '2025',
    bullets: Array.from({ length: 5 }, (_, j) => ({
      id: crypto.randomUUID(),
      text: `Led architecture and delivery of distributed backend platform component ${j + 1} serving millions of requests with strong reliability.`,
      isVerified: true,
    })),
  }));

  const est = estimateResumePages(p, baseTheme);
  assert.ok(est > 1.5, `Expected dense senior CV > 1.5 pages, got ${est}`);
  const res = autoOptimizeTheme(p, baseTheme);
  assert.equal(res.theme.fitOnePage, undefined);
});
