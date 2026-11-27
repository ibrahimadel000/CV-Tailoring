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

const { singleDraftInstructions, prepareSingleDraftRequest, isInProgressEducationText } = load('services/resumeComposer/singleDraftRequest');
const { prepareNaturalComposition } = load('services/resumeComposer/naturalDocument');
const { unsupportedTerms } = load('services/resumeComposer/terms');
const { scopeRisk } = load('services/resumeComposer/scopeRisk');
const { containsSkillName } = load('services/resumeComposer/summaryBoundary');
const { fixture } = require('./helpers/composer-editorial-v4-fixture.cjs');

test('Phase 10 jobMatchedSkillIds captures SaaS inside multi-word skills, &-split hyphenated phrases, and injects schema description', () => {
  const p = fixture();
  p.skills.data = [
    { id: '00000000-0000-4000-8000-000000000101', name: 'Full-Stack SaaS Architecture', category: 'Technical' },
    { id: '00000000-0000-4000-8000-000000000102', name: 'Problem Solving & Algorithm Design', category: 'Technical' },
    { id: '00000000-0000-4000-8000-000000000103', name: 'C#', category: 'Languages' },
    { id: '00000000-0000-4000-8000-000000000104', name: 'C++', category: 'Languages' },
    { id: '00000000-0000-4000-8000-000000000105', name: 'AWS Cloud Services', category: 'Tools' },
    { id: '00000000-0000-4000-8000-000000000106', name: 'CI/CD', category: 'Tools' },
    { id: '00000000-0000-4000-8000-000000000107', name: 'Excel (Basic)', category: 'Tools' },
  ];
  const job = [
    'Backend Software Engineer building SaaS applications with C# and C++.',
    'Strong problem-solving skills and basic CD archiving.',
    'AWS is not required for this role.',
  ].join('\n');

  const packet = prepareNaturalComposition(p, job);
  const req = prepareSingleDraftRequest(packet, 2026);
  const parsed = JSON.parse(req.wire);
  assert.deepEqual(parsed.guide.jobMatchedSkillIds, ['skill_1', 'skill_2', 'skill_3', 'skill_4']);
  const desc = req.responseSchema.properties.skillSelections.description || '';
  assert.ok(desc.includes('skill_1') && desc.includes('skill_2') && desc.includes('skill_3') && desc.includes('skill_4'));
});

test('Phase 10 detects future/in-progress education and blocks completed-degree claims in scopeRisk', () => {
  assert.equal(isInProgressEducationText('Bachelor of Computer Science · Twintech · 2027', 2026), true);
  assert.equal(isInProgressEducationText('Bachelor of Computer Science · Twintech · 2027', 2027), false);
  assert.equal(isInProgressEducationText('B.S. Computer Science · Expected May 2027', 2027), true);

  const eduSupport = ['Bachelor of Computer Science · International University of Technology Twintech · 2027'];
  const badRisks = scopeRisk('Software Engineer with a Bachelor of Computer Science specializing in backend systems.', eduSupport, 2026);
  assert.ok(badRisks.some(r => r.includes('in-progress or expected degree')));

  const goodRisks = scopeRisk('Software Engineer pursuing a Bachelor of Computer Science (Expected 2027).', eduSupport, 2026);
  assert.deepEqual(goodRisks, []);
});

test('Phase 10 guard calibration eliminates false-positive reverts while sealing subtle truthfulness leaks', () => {
  // False-positive fixes
  assert.deepEqual(unsupportedTerms('Refactored PostgreSQL queries across backend services.', ['Optimized PostgreSQL queries across backend services.'], []), []);
  assert.deepEqual(unsupportedTerms('Co-developed Node.js microservices with backend engineers.', ['Assisted with Node.js microservices.'], []), []);
  assert.deepEqual(unsupportedTerms('Delivered React-based dashboards for internal operations.', ['Built dashboards in React for internal operations.'], []), []);
  assert.deepEqual(scopeRisk('Migrated database with zero downtime.', ['Migrated database without downtime.'], 2026), []);
  assert.deepEqual(scopeRisk('Managed team workflows and sprint schedules.', ['Coordinated team workflows and sprint schedules.'], 2026), []);
  assert.deepEqual(scopeRisk('Prototyped a monitoring dashboard.', ['Built a prototype monitoring dashboard.'], 2026), []);
  assert.equal(containsSkillName('Optimized SQL query latency.', 'SQL Queries'), true);
  assert.equal(containsSkillName('Built end to end testing suites.', 'End-to-End Testing'), true);

  // Truthfulness leak fixes
  assert.ok(scopeRisk('Deployed services to production without errors.', ['Tested services in non-production without errors.'], 2026).length > 0);
  assert.ok(scopeRisk('Senior backend engineer building scalable web services.', ['Backend engineer building scalable web services.'], 2026).length > 0);
  assert.ok(unsupportedTerms('Stored backups in S3 buckets.', ['Stored backups on local disks.'], []).some(t => t.label === 'S3'));
});

test('Phase 10 singleDraftInstructions stays under 8000 chars and includes all required contracts', () => {
  assert.ok(singleDraftInstructions.length < 8000);
  assert.ok(singleDraftInstructions.includes('guide.inProgressEducationIds'));
  assert.ok(singleDraftInstructions.includes('Adept at'));
  assert.ok(singleDraftInstructions.includes('FINAL SELF-CHECK'));
});

test('Phase 10 auditor edge cases: milliseconds, Associate title, graduate student, multi-degree, pre-production, CS 2048, and prepositional management', () => {
  assert.deepEqual(scopeRisk('Optimized API responses under 50 ms.', ['Currently optimizing API responses under 50 ms.'], 2026), []);
  assert.deepEqual(scopeRisk('Associate Software Engineer building backend APIs.', ['Currently serving as Associate Software Engineer building backend APIs.'], 2026), []);
  assert.deepEqual(scopeRisk('Managed tools for engineers across teams.', ['Built tools for engineers across teams.'], 2026), []);
  assert.deepEqual(scopeRisk('Computer Science graduate student (Expected 2027).', ['M.S. Computer Science · Expected 2027'], 2026), []);
  assert.deepEqual(scopeRisk('Software Engineer with a Bachelor of Science in CS, pursuing an M.S. (Expected 2027).', ['Bachelor of Science in CS · 2022', 'M.S. Data Science · Expected 2027'], 2026), []);
  assert.ok(scopeRisk('Deployed to production without errors.', ['Tested in pre-production without errors.'], 2026).length > 0);
  assert.equal(isInProgressEducationText('B.S. Computer Science · Class of 2022 · CS 2048', 2026), false);
  assert.equal(containsSkillName('Built end - to - end tests.', 'End-to-End'), true);
});
