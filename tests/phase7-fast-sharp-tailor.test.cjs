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

const { singleDraftInstructions } = load('services/resumeComposer/singleDraftRequest');
const { unsupportedTerms } = load('services/resumeComposer/terms');
const { containsSkillName } = load('services/resumeComposer/summaryBoundary');
const { scopeRisk } = load('services/resumeComposer/scopeRisk');

test('singleDraftInstructions enforces sharp anti-cliche bullets, Step 1 JD skill matching, and stays under 8000 chars', () => {
  assert.ok(singleDraftInstructions.length < 8000);
  assert.ok(singleDraftInstructions.includes('Proven record'));
  assert.ok(singleDraftInstructions.includes('12–22 word'));
  assert.ok(singleDraftInstructions.includes('Step 1 (Mandatory JD matches first)'));
  assert.ok(singleDraftInstructions.includes('C#'));
  assert.equal(singleDraftInstructions.includes('alternativeEntries'), false);
});

test('terms.ts allows sentence-initial strong verbs before tools and covered slash pairs while still catching CI/CD', () => {
  const u1 = unsupportedTerms('Scaled MySQL queries across backend services.', ['Optimized MySQL queries across backend services.'], []);
  assert.deepEqual(u1, []);

  const u2 = unsupportedTerms('Aligned planning/execution across teams.', ['Aligned planning and execution across teams.'], []);
  assert.deepEqual(u2, []);

  const u3 = unsupportedTerms('Built CI/CD pipelines.', ['Built web applications.'], []);
  assert.ok(u3.some(t => t.label === 'CI/CD'));
});

test('summaryBoundary supports singular/plural skill matching and scopeRisk preserves Co-developed participation wording', () => {
  assert.equal(containsSkillName('Built a RESTful API for internal workflows.', 'RESTful APIs'), true);
  assert.equal(containsSkillName('Built RESTful APIs for internal workflows.', 'RESTful API'), true);

  const risks = scopeRisk('Co-developed backend services with the engineering team.', ['Assisted with backend services for the engineering team.']);
  assert.deepEqual(risks, []);
});

test('truthfulness regressions: catches Senior title inflation, em-dash invented tools, Co-led scope inflation, and Windows/Canvas boundary isolation', () => {
  const seniority = unsupportedTerms('Senior Archive Coordinator who managed cataloging.', ['Archive Coordinator who managed cataloging.'], []);
  assert.ok(seniority.some(t => t.label === 'Senior Archive Coordinator'));

  const emDash = unsupportedTerms('Built web apps — Kubernetes.', ['Built web apps.'], []);
  assert.ok(emDash.some(t => t.label === 'Kubernetes'));

  const coLedRisks = scopeRisk('Co-led backend services with the engineering team.', ['Assisted with backend services for the engineering team.']);
  assert.ok(coLedRisks.length > 0);

  assert.equal(containsSkillName('Optimized window rendering performance.', 'Windows'), false);
  assert.equal(containsSkillName('Designed posters in Canva.', 'Canvas'), false);
  assert.equal(containsSkillName('Collaborated with the product team.', 'Teams'), false);
});
