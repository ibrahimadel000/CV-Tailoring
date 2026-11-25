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

test('analyzeJobMatch separates experience-matched, skills-listed, and missing job requirements', () => {
  const p = createSampleProfile('Match check');
  p.summary.data = 'Software Engineer designing scalable web applications.';
  p.experience.data = [{
    id: crypto.randomUUID(),
    roleTitle: 'Software Engineer',
    companyName: 'CyberX',
    startDate: '2023',
    endDate: '2026',
    bullets: [{ id: crypto.randomUUID(), text: 'Built RESTful APIs with Node.js and streamlined CI/CD pipelines.', isVerified: true }],
  }];
  p.projects.data = [];
  p.skills.data = [
    { id: crypto.randomUUID(), name: 'Python', category: 'Languages' },
    { id: crypto.randomUUID(), name: 'MySQL', category: 'Tools' },
  ];
  p.certifications.data = [];

  const job = 'Looking for a Full-Stack Engineer who can go fast with RESTful APIs, Node.js, Next.js, Python, MySQL, Docker, and GraphQL. No prior Kubernetes experience required.';
  const before = JSON.stringify(p);
  const res = analyzeJobMatch(p, job);

  assert.equal(JSON.stringify(p), before);
  assert.ok(res.matched.includes('RESTful APIs'));
  assert.ok(res.matched.includes('Node.js'));
  assert.ok(res.listed.includes('Python'));
  assert.ok(res.listed.includes('MySQL'));
  assert.ok(res.missing.includes('Next.js'));
  assert.ok(res.missing.includes('Docker'));
  assert.ok(res.missing.includes('GraphQL'));
  assert.equal(res.missing.includes('Kubernetes'), false);
  // Lowercase verb "go" must not trigger the Go programming language requirement.
  assert.equal(res.missing.includes('Go'), false);
  assert.equal(res.matched.includes('Go'), false);
});

test('analyzeJobMatch distinguishes React Native from React and handles C# and Go case-sensitively', () => {
  const p = createSampleProfile('Precision check');
  p.summary.data = 'Mobile Engineer building cross-platform apps.';
  p.experience.data = [{
    id: crypto.randomUUID(),
    roleTitle: 'Mobile Developer',
    companyName: 'AppCo',
    startDate: '2024',
    endDate: '2026',
    bullets: [{ id: crypto.randomUUID(), text: 'Built mobile apps in React Native and backend workers in Go.', isVerified: true }],
  }];
  p.projects.data = [];
  p.skills.data = [{ id: crypto.randomUUID(), name: 'C#', category: 'Languages' }];
  p.certifications.data = [];

  const job = 'We need React Native, React, Go, and C# experience.';
  const res = analyzeJobMatch(p, job);

  assert.ok(res.matched.includes('React Native'));
  assert.ok(res.matched.includes('Go'));
  assert.ok(res.listed.includes('C#'));
  // Having only React Native in CV must NOT count as having web React.
  assert.ok(res.missing.includes('React'));
});

test('cvProfileSchema accepts optional compositionSnapshot while staying backward-compatible', () => {
  const p = createSampleProfile('Snapshot check');
  assert.equal(cvProfileSchema.safeParse(p).success, true);
  p.compositionSnapshot = {
    summary: p.summary.data,
    experience: p.experience.data.map(e => ({ id: e.id, bullets: e.bullets.map(b => ({ id: b.id, text: b.text })) })),
    projects: [],
    skills: p.skills.data.map(s => ({ ...s })),
  };
  assert.equal(cvProfileSchema.safeParse(p).success, true);
});
