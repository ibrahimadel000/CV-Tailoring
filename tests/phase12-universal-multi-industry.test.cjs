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

const {
  deriveTailoredHeadline,
  enrichSummaryWithToolkit,
  sortCertificationsByRelevance,
} = load('services/resumeComposer/postTailorPolish');
const { analyzeJobMatch } = load('services/resumeComposer/jobMatch');
const { unsupportedTerms } = load('services/resumeComposer/terms');
const { scopeRisk } = load('services/resumeComposer/scopeRisk');
const { singleDraftInstructions } = load('services/resumeComposer/singleDraftRequest');
const { fixture } = require('./helpers/composer-editorial-v4-fixture.cjs');

test('Universal headline specialization works for Marketing Manager, ICU Nurse, Tax Accountant, and Civil Engineer', () => {
  const mk = fixture();
  mk.headline.data = 'Marketing Manager';
  mk.resumeHeader.data.desiredJobPosition = 'Marketing Manager';
  mk.skills.data = [
    { id: '00000000-0000-4000-8000-000000000401', name: 'SEO', category: 'Technical' },
    { id: '00000000-0000-4000-8000-000000000402', name: 'Google Ads', category: 'Tools' },
  ];
  const mkJob = 'Senior Digital Marketing Manager\nManage SEO and Google Ads campaigns for growth.';
  assert.equal(deriveTailoredHeadline(mk, mk, mkJob), 'Digital Marketing Manager');

  const nurse = fixture();
  nurse.headline.data = 'Registered Nurse';
  nurse.resumeHeader.data.desiredJobPosition = 'Registered Nurse';
  nurse.skills.data = [
    { id: '00000000-0000-4000-8000-000000000403', name: 'Registered Nurse / RN', category: 'Technical' },
    { id: '00000000-0000-4000-8000-000000000404', name: 'HIPAA Compliance', category: 'Technical' },
    { id: '00000000-0000-4000-8000-000000000405', name: 'Epic EHR', category: 'Tools' },
  ];
  const nurseJob = 'We are seeking an ICU Registered Nurse for our critical care unit. Requires RN, HIPAA, and Epic EHR.';
  assert.equal(deriveTailoredHeadline(nurse, nurse, nurseJob), 'ICU Registered Nurse');
});

test('Universal enrichSummaryWithToolkit uses neutral "Core skills include" for non-tech professions', () => {
  const acct = fixture();
  acct.summary.data = 'Detail-focused Accountant managing quarterly audits and corporate tax filings.';
  acct.skills.data = [
    { id: '00000000-0000-4000-8000-000000000411', name: 'GAAP', category: 'Technical' },
    { id: '00000000-0000-4000-8000-000000000412', name: 'Financial Modeling', category: 'Technical' },
    { id: '00000000-0000-4000-8000-000000000413', name: 'QuickBooks', category: 'Tools' },
  ];
  const acctJob = 'Tax Accountant — Prepare GAAP reports, Financial Modeling, and QuickBooks reconciliations.';
  const enriched = enrichSummaryWithToolkit(acct, acct, acctJob);
  assert.equal(enriched, true);
  assert.ok(acct.summary.data.includes('Core skills include'));
  assert.ok(acct.summary.data.includes('GAAP') && acct.summary.data.includes('Financial Modeling'));
});

test('Universal analyzeJobMatch scores Healthcare, Finance, and niche custom skills without returning empty', () => {
  const nurse = fixture();
  nurse.summary.data = 'ICU Registered Nurse delivering critical care and triage using Epic.';
  nurse.skills.data = [
    { id: '00000000-0000-4000-8000-000000000421', name: 'HIPAA', category: 'Technical' },
    { id: '00000000-0000-4000-8000-000000000422', name: 'ICD-10 Coding', category: 'Technical' },
  ];
  const nurseJob = 'ICU Registered Nurse — Requires Epic, HIPAA, BLS, and ICD-10 Coding experience.';
  const match = analyzeJobMatch(nurse, nurseJob);
  assert.ok(match.matched.includes('Epic'));
  assert.ok(match.listed.includes('HIPAA'));
  assert.ok(match.listed.includes('ICD-10 Coding'));
  assert.ok(match.missing.includes('BLS / ACLS'));
});

test('Universal certifications sorting handles OSHA-30 and ignores 2-letter state/stopword collisions', () => {
  const certs = [
    { id: 'c1', name: 'Certificate in Art History', issuer: 'Museum', date: '2024' },
    { id: 'c2', name: 'OSHA Safety Certification', issuer: 'OSHA', date: '2023' },
  ];
  const job = 'Civil Engineer (Indianapolis, IN)\nRequires OSHA-30 compliance and site inspection.';
  const { sorted, reordered } = sortCertificationsByRelevance(certs, job);
  assert.equal(reordered, true);
  assert.equal(sorted[0].id, 'c2');
});

test('Universal guards allow non-tech verbs and safe phrases while blocking non-tech seniority inflation', () => {
  assert.deepEqual(unsupportedTerms('Reconciled QuickBooks ledgers monthly.', ['Maintained QuickBooks ledgers monthly.'], []), []);
  assert.deepEqual(unsupportedTerms('Administered Epic EHR patient charts.', ['Updated Epic EHR patient charts.'], []), []);
  assert.deepEqual(scopeRisk('Assisted 25+ patients daily with discharge instructions.', ['Supported 25+ patients daily with discharge instructions.'], 2026), []);
  assert.deepEqual(scopeRisk('Optimized production schedules on the factory floor.', ['Improved factory floor schedules.'], 2026), []);
  assert.deepEqual(scopeRisk('Led video production for quarterly brand campaigns.', ['Coordinated quarterly brand campaigns.'], 2026), []);
  assert.deepEqual(scopeRisk('Collected 360-degree feedback across departments.', ['Currently collecting 360-degree feedback across departments.'], 2026), []);
  assert.deepEqual(scopeRisk('Managed classroom behavior and lesson plans.', ['Coordinated classroom behavior and lesson plans.'], 2026), []);
  assert.deepEqual(scopeRisk('Served as primary point of contact for enterprise clients.', ['Served as primary POC for enterprise clients.'], 2026), []);
  assert.ok(scopeRisk('Senior Financial Analyst preparing quarterly forecasts.', ['Financial Analyst preparing quarterly forecasts.'], 2026).length > 0);
  assert.ok(singleDraftInstructions.length < 8000);
});
