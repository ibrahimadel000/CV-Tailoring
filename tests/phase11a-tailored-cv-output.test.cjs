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
  ensureJobMatchedSkills,
  enrichSummaryWithToolkit,
  sortCertificationsByRelevance,
  sortProjectsByRelevance,
} = load('services/resumeComposer/postTailorPolish');
const { fixture } = require('./helpers/composer-editorial-v4-fixture.cjs');

const BACKEND_JOB = [
  'Senior Backend Software Engineer',
  'We are looking for a Software Engineer to build scalable web applications and backend services.',
  'Responsibilities: Develop RESTful APIs, work with MySQL, and improve workflows.',
  'Requirements: PHP, Python, Java, C#, C++, software design, system architecture, problem-solving.',
  'Preferred: Laravel and SaaS applications.',
  'Photoshop is not required.',
].join('\n');

function backendProfile() {
  const p = fixture();
  p.headline.data = 'Software Engineer';
  p.resumeHeader.data.desiredJobPosition = 'Software Engineer';
  p.summary.data = 'Software Engineer designing scalable web applications and technical architectures.';
  p.skills.data = [
    { id: '00000000-0000-4000-8000-000000000201', name: 'PHP (Laravel, Custom MVC)', category: 'Languages' },
    { id: '00000000-0000-4000-8000-000000000202', name: 'Python', category: 'Languages' },
    { id: '00000000-0000-4000-8000-000000000203', name: 'Java', category: 'Languages' },
    { id: '00000000-0000-4000-8000-000000000204', name: 'C#', category: 'Languages' },
    { id: '00000000-0000-4000-8000-000000000205', name: 'C++', category: 'Languages' },
    { id: '00000000-0000-4000-8000-000000000206', name: 'MySQL', category: 'Tools' },
    { id: '00000000-0000-4000-8000-000000000207', name: 'RESTful APIs', category: 'Technical' },
    { id: '00000000-0000-4000-8000-000000000208', name: 'Full-Stack SaaS Architecture', category: 'Technical' },
    { id: '00000000-0000-4000-8000-000000000209', name: 'Problem Solving & Algorithm Design', category: 'Technical' },
    { id: '00000000-0000-4000-8000-000000000210', name: 'Photoshop', category: 'Tools' },
  ];
  return p;
}

test('deriveTailoredHeadline specializes Software Engineer to Backend Software Engineer while stripping Senior', () => {
  const src = backendProfile();
  const copy = JSON.parse(JSON.stringify(src));
  assert.equal(deriveTailoredHeadline(src, copy, BACKEND_JOB), 'Backend Software Engineer');

  // Never turns an unrelated role into Backend Software Engineer
  src.headline.data = 'Graphic Designer';
  src.resumeHeader.data.desiredJobPosition = 'Graphic Designer';
  assert.equal(deriveTailoredHeadline(src, copy, BACKEND_JOB), null);

  // Respects headline lock
  src.headline.data = 'Software Engineer';
  src.resumeHeader.data.desiredJobPosition = 'Software Engineer';
  src.headline.isLocked = true;
  assert.equal(deriveTailoredHeadline(src, copy, BACKEND_JOB), null);
});

test('ensureJobMatchedSkills restores dropped JD-matched skills (C#, C++, SaaS, Problem Solving) and skips negated skills', () => {
  const src = backendProfile();
  const copy = JSON.parse(JSON.stringify(src));
  // Simulate AI dropping C#, C++, Full-Stack SaaS Architecture, and Problem Solving
  copy.skills.data = copy.skills.data.filter(s => ['PHP (Laravel, Custom MVC)', 'Python', 'MySQL', 'RESTful APIs'].includes(s.name));
  const added = ensureJobMatchedSkills(src, copy, BACKEND_JOB);
  assert.equal(added, 5); // Java, C#, C++, Full-Stack SaaS Architecture, Problem Solving & Algorithm Design
  const names = copy.skills.data.map(s => s.name);
  assert.ok(names.includes('C#') && names.includes('C++') && names.includes('Full-Stack SaaS Architecture') && names.includes('Problem Solving & Algorithm Design'));
  assert.equal(names.includes('Photoshop'), false);
});

test('enrichSummaryWithToolkit upgrades short tech-free summary with truthful JD-matched toolkit sentence', () => {
  const src = backendProfile();
  const copy = JSON.parse(JSON.stringify(src));
  copy.summary.data = 'Software Engineer designing scalable web applications and technical architectures.';
  const enriched = enrichSummaryWithToolkit(src, copy, BACKEND_JOB);
  assert.equal(enriched, true);
  assert.ok(copy.summary.data.includes('Core skills include'));
  assert.ok(copy.summary.data.includes('PHP (Laravel, Custom MVC)'));
  assert.ok(copy.summary.data.includes('MySQL'));
  assert.equal(copy.summary.data.includes('Photoshop'), false);
});

test('sortCertificationsByRelevance moves Python/Java/C++ cert ahead of Social Media Marketing', () => {
  const certs = [
    { id: 'c1', name: 'Basics of Social Media Marketing', issuer: 'Marketing Institute', date: 'Jun 2024' },
    { id: 'c2', name: 'ICDL – International Computer Driving Licence', issuer: 'ICDL', date: 'Nov 2022' },
    { id: 'c3', name: 'Programming Basics: Python, Java, C++', issuer: 'Tech Academy', date: 'Jan 2023' },
  ];
  const { sorted, reordered } = sortCertificationsByRelevance(certs, BACKEND_JOB);
  assert.equal(reordered, true);
  assert.equal(sorted[0].id, 'c3');
  assert.equal(sorted[1].id, 'c1');
  assert.equal(sorted[2].id, 'c2');
});

test('sortProjectsByRelevance puts Laravel/MySQL API project ahead of unrelated marketing project', () => {
  const projects = [
    { id: 'p1', name: 'Brand Portfolio', role: 'Designer', bullets: [{ id: 'b1', text: 'Designed social media banners.' }] },
    { id: 'p2', name: 'SaaS Billing API', role: 'Backend Dev', bullets: [{ id: 'b2', text: 'Built RESTful APIs for SaaS invoicing.' }] },
  ];
  const { sorted, reordered } = sortProjectsByRelevance(projects, BACKEND_JOB);
  assert.equal(reordered, true);
  assert.equal(sorted[0].id, 'p2');
});

test('Phase 11A auditor edge cases: Arabic summary untouched, parens/location stripped from headline, single-paragraph JD negation, and equivalent skill dedup', () => {
  const src = backendProfile();
  const copy = JSON.parse(JSON.stringify(src));
  copy.summary.data = 'مهندس برمجيات متخصص في بناء تطبيقات الويب القابلة للتوسع.';
  assert.equal(enrichSummaryWithToolkit(src, copy, BACKEND_JOB), false);

  const messyJob = '(Remote) Senior Backend Software Engineer III - NYC\nPHP, Python, MySQL, RESTful APIs.';
  assert.equal(deriveTailoredHeadline(src, copy, messyJob), 'Backend Software Engineer');

  const singleParaJob = 'Requirements: PHP, Python, MySQL, RESTful APIs. Photoshop is not required.';
  const copy2 = JSON.parse(JSON.stringify(src));
  copy2.skills.data = copy2.skills.data.filter(s => s.name === 'PHP (Laravel, Custom MVC)');
  assert.ok(ensureJobMatchedSkills(src, copy2, singleParaJob) >= 3);
  assert.equal(copy2.skills.data.some(s => s.name === 'Photoshop'), false);
});

test('bare API acronym inside LLM Integration (Gemini API) does not false-match RESTful APIs in a Backend JD', () => {
  const src = backendProfile();
  src.skills.data.unshift({ id: '00000000-0000-4000-8000-000000000299', name: 'LLM Integration (Gemini API)', category: 'Technical' });
  const copy = JSON.parse(JSON.stringify(src));
  copy.skills.data = copy.skills.data.filter(s => s.name === 'PHP (Laravel, Custom MVC)' || s.name === 'MySQL');
  ensureJobMatchedSkills(src, copy, BACKEND_JOB);
  const names = copy.skills.data.map(s => s.name);
  assert.equal(names.includes('LLM Integration (Gemini API)'), false);
  assert.equal(names.includes('RESTful APIs'), true);

  const enriched = enrichSummaryWithToolkit(src, copy, BACKEND_JOB);
  assert.equal(enriched, true);
  assert.equal(copy.summary.data.includes('LLM Integration (Gemini API)'), false);
  assert.equal(copy.summary.data.includes('MySQL'), true);
});
