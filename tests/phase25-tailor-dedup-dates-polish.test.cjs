if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { unzipSync, strFromU8 } = require('fflate');

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

const { createSampleProfile } = load('mock/profile');
const { deduplicateRoleOverviews } = load('services/resumeComposer/postTailorPolish');
const { formatDateRange, resumeBlocks } = load('components/builder/resumeModel');
const { buildResumeDocxBytes } = load('services/docxExport');
const { buildResumeMarkdown } = load('services/markdownExport');

test('deduplicateRoleOverviews removes duplicate overview when tailor repeats it in bullets, strips trailing role echo, and preserves distinct overviews', () => {
  const source = createSampleProfile('Dedup Source');
  source.experience.data = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      roleTitle: 'Cybersecurity Consultant',
      companyName: 'SMEPS',
      city: "Sana'a",
      startDate: '2023',
      endDate: '2023',
      description: 'I used to train companies leader in cybersecurity for network and maintenance.',
      bullets: [],
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      roleTitle: 'IT Manager',
      companyName: 'Al-Nada Center',
      city: "Sana'a",
      startDate: '2019',
      endDate: '2021',
      description: 'Led 12-person infrastructure department across 3 regional offices.',
      bullets: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', text: 'Migrated ERP database to PostgreSQL with zero downtime.', isVerified: false }],
    },
  ];

  const copy = structuredClone(source);
  // Role 1: Tailor rewrote description AND created a duplicate bullet + echoed "as a Cybersecurity Consultant."
  copy.experience.data[0].description = 'Trained corporate leaders and software developers in cybersecurity and network maintenance as a Cybersecurity Consultant.';
  copy.experience.data[0].bullets = [
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', text: 'Trained software developers and company leaders in cybersecurity and network maintenance.', isVerified: false },
  ];
  // Role 2: Distinct non-overlapping overview with trailing role echo — should strip echo AND keep overview!
  copy.experience.data[1].description = 'Oversaw 12-person infrastructure department across 3 regional offices as IT Manager.';

  const count = deduplicateRoleOverviews(source, copy);
  assert.ok(count >= 2);
  // Role 1 duplicate description cleared cleanly
  assert.equal(copy.experience.data[0].description, '');
  assert.equal(copy.experience.data[0].bullets.length, 1);
  // Role 2 distinct overview preserved with trailing "as IT Manager" stripped
  assert.equal(copy.experience.data[1].description, 'Oversaw 12-person infrastructure department across 3 regional offices.');
});

test('formatDateRange collapses identical start/end years across PDF/HTML (resumeBlocks), Markdown, and DOCX', () => {
  assert.equal(formatDateRange('2023', '2023'), '2023');
  assert.equal(formatDateRange('2023', ' 2023 '), '2023');
  assert.equal(formatDateRange('2021', '2023'), '2021 – 2023');
  assert.equal(formatDateRange('2022', 'Present'), '2022 – Present');
  assert.equal(formatDateRange('', '2020'), '2020');

  const p = createSampleProfile('Same Year Dates');
  p.experience.data[0].startDate = '2023';
  p.experience.data[0].endDate = '2023';

  const expBlock = resumeBlocks(p).find(b => b.id === 'experience');
  assert.equal(expBlock.items[0].date, '2023');

  const md = buildResumeMarkdown(p);
  assert.doesNotMatch(md, /2023 – 2023/);

  const docxXml = strFromU8(unzipSync(buildResumeDocxBytes(p, {
    accentColor: '#2557a7',
    fontFamily: 'sans',
    fontSize: 'medium',
    lineSpacing: 'normal',
    layoutStyle: 'modern',
  }))['word/document.xml']);
  assert.doesNotMatch(docxXml, /2023 – 2023/);
});

test('workflow wires deduplicateRoleOverviews and importHandler preserves concrete tools/languages from Skills & Experience', () => {
  const wf = fs.readFileSync(path.join(root, 'src/services/resumeComposer/workflow.ts'), 'utf8');
  assert.match(wf, /deduplicateRoleOverviews\(profile, copy\)/);

  const handler = fs.readFileSync(path.join(root, 'server/importHandler.mjs'), 'utf8');
  assert.match(handler, /Skills & Experience/);
  assert.match(handler, /explicitly written there/);
});

test('audit regressions: preserves role-linking verbs, protects untouched descriptions, strips base role echoes, and handles Unicode/Arabic overlap', () => {
  const source = createSampleProfile('Audit Edge Cases');
  source.experience.data = [
    {
      id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      roleTitle: 'IT Manager',
      companyName: 'Alpha Co',
      startDate: '2020',
      endDate: '2022',
      description: 'Original untouched overview covering cloud infrastructure and database security.',
      bullets: [{ id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', text: 'Managed cloud infrastructure and database security.', isVerified: false }],
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
      roleTitle: 'Teaching assistant for computer security & network',
      companyName: "Sana'a University",
      startDate: '2015',
      endDate: 'Present',
      description: 'Original teaching overview.',
      bullets: [{ id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2', text: 'Original bullet.', isVerified: false }],
    },
  ];

  const copy = structuredClone(source);
  // Role 1: description untouched — MUST NOT be deleted even though overlap >= 45%
  // Role 1 bullet: "Served as IT Manager." — MUST NOT be stripped to broken "Served."
  copy.experience.data[0].bullets[0].text = 'Served as IT Manager.';
  // Role 2: tailored description echoes shorter base title "as a Teaching Assistant." — MUST strip echo!
  copy.experience.data[1].description = 'Taught computer security and network subjects in CS departments as a Teaching Assistant.';

  deduplicateRoleOverviews(source, copy);
  assert.equal(copy.experience.data[0].description, source.experience.data[0].description);
  assert.equal(copy.experience.data[0].bullets[0].text, 'Served as IT Manager.');
  assert.equal(copy.experience.data[1].description, 'Taught computer security and network subjects in CS departments.');

  // formatDateRange edge cases
  assert.equal(formatDateRange('Mar 2023', 'Mar 2023'), 'Mar 2023');
  assert.equal(formatDateRange('2023', ''), '2023');
});
