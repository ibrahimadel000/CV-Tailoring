if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;

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
    .replaceAll('import.meta.env.VITE_GEMINI_API_KEY', "''")
    .replaceAll('import.meta.url', "'file:///local/'");
  m._compile(ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file);
  return m.exports;
}

const {
  hasFirstPersonPronoun,
  lintBullets,
  lintSummary,
  lintDateRange,
  collectProfileDateStyles,
} = load('services/readabilityCheck');
const {
  polishHumanPunctuation,
  polishTailoredCopyPunctuation,
} = load('services/resumeComposer/postTailorPolish');
const { fixture } = require('./helpers/composer-editorial-v4-fixture.cjs');

test('hasFirstPersonPronoun catches My/my/me/I while sparing Roman numerals, mining nouns, state codes, and hyphenated tokens', () => {
  assert.equal(hasFirstPersonPronoun('My team delivered 3x revenue growth.'), true);
  assert.equal(hasFirstPersonPronoun('I led quarterly financial audits.'), true);
  assert.equal(hasFirstPersonPronoun('Phase I was completed ahead of schedule.'), false);
  assert.equal(hasFirstPersonPronoun('Level I managed care protocols for 200 patients.'), false);
  assert.equal(hasFirstPersonPronoun('Mine safety inspector for open-pit gold mine operations.'), false);
  assert.equal(hasFirstPersonPronoun('Deployed my-service to Kubernetes in Portland, ME.'), false);
});

test('lintBullets flags long bullets, passive openers, first-person pronouns, and 3+ repeated openers while keeping hyphenated openers distinct', () => {
  const bullets = [
    { id: 'b1', text: 'Managed daily clinic schedules for 14 staff members and reduced patient wait times by 20%.', isVerified: true },
    { id: 'b2', text: 'Managed Level I trauma intake protocols and Phase I was completed on time.', isVerified: true },
    { id: 'b3', text: 'Managed vendor renewals across three regional hospitals.', isVerified: true },
    { id: 'b4', text: 'Responsible for overseeing my department budget and I led quarterly audits across multiple regional offices with detailed compliance reviews and stakeholder updates every month for senior leadership and external auditors to review before finalizing annual budget forecasts and regulatory filings.', isVerified: true },
    { id: 'b5', text: 'Cross-trained 6 new nurses on ICU monitoring.', isVerified: true },
    { id: 'b6', text: 'Cross-functional collaboration with pharmacy leads.', isVerified: true },
    { id: 'b7', text: 'Cross-checked medication logs prior to shift handoff.', isVerified: true },
  ];

  const hints = lintBullets(bullets);
  assert.equal(hints.get('b1'), undefined);
  assert.equal(hints.get('b2'), undefined);
  assert.ok(hints.get('b3')?.some(h => h.id === 'repeated-opener'));
  assert.equal(hints.get('b4')?.length, 2);
  assert.ok(hints.get('b4')?.some(h => h.id === 'long-bullet'));
  assert.ok(hints.get('b4')?.some(h => h.id === 'passive-opener'));
  // Distinct hyphenated openers must NOT trigger repeated-opener
  assert.equal(hints.get('b7'), undefined);
});

test('lintSummary flags overly long summaries and first-person pronouns', () => {
  assert.deepEqual(lintSummary('Operations manager overseeing multi-site logistics and vendor contracts.'), []);
  const fp = lintSummary('My background spans accounting and I manage client audits.');
  assert.ok(fp.some(h => h.id === 'first-person'));
  const longText = Array(80).fill('operations').join(' ');
  assert.ok(lintSummary(longText).some(h => h.id === 'long-summary'));
});

test('lintDateRange detects reversed dates and mixed styles while tolerating same-year mixed precision', () => {
  const p = fixture();
  p.experience.data[0].startDate = 'Jan 2022';
  p.experience.data[0].endDate = 'Dec 2024';
  p.experience.data.push({
    ...p.experience.data[0],
    id: crypto.randomUUID(),
    startDate: 'Mar 2020',
    endDate: 'Dec 2021',
  });
  p.education.data[0].startDate = '2018';
  p.education.data[0].endDate = '2021';
  const styles = collectProfileDateStyles(p);
  assert.equal(styles.styles.size, 2);
  assert.equal(styles.dominant, 'month-year');

  // Mixed date style warning emitted on year-only entry
  const mixed = lintDateRange('2018', '2021', styles);
  assert.ok(mixed.some(h => h.id === 'mixed-date-style'));

  // Reversed range
  const rev = lintDateRange('2024', '2021');
  assert.ok(rev.some(h => h.id === 'reversed-dates'));

  // Same-year mixed precision ("Jan 2024" -> "2024") is NOT reversed
  const okMixed = lintDateRange('Jan 2024', '2024');
  assert.ok(!okMixed.some(h => h.id === 'reversed-dates'));
});

test('polishHumanPunctuation cleans AI em-dashes and smart quotes while preserving .NET, .csv, .env, newlines, URLs, and locked/untouched text', () => {
  assert.equal(
    polishHumanPunctuation('Built reporting pipelines — cutting manual close time by 30%  and improving “audit” accuracy .'),
    'Built reporting pipelines, cutting manual close time by 30% and improving "audit" accuracy.',
  );
  assert.equal(
    polishHumanPunctuation('Built .NET Core APIs, exported .csv and .pdf reports, and managed .env configs.'),
    'Built .NET Core APIs, exported .csv and .pdf reports, and managed .env configs.',
  );
  assert.equal(
    polishHumanPunctuation('See https://example.com/a—b for details — deployed cleanly.'),
    'See https://example.com/a—b for details, deployed cleanly.',
  );

  const src = fixture();
  const copy = JSON.parse(JSON.stringify(src));
  src.summary.isLocked = true;
  copy.summary.data = 'Locked — should stay untouched';
  src.experience.data[0].bullets[0].text = 'Original bullet — untouched by AI.';
  copy.experience.data[0].bullets[0].text = 'Original bullet — untouched by AI.';
  copy.experience.data[0].bullets[1].text = 'Rewritten bullet — with smart “quotes”  and space .';

  polishTailoredCopyPunctuation(src, copy);
  assert.equal(copy.summary.data, 'Locked — should stay untouched');
  assert.equal(copy.experience.data[0].bullets[0].text, 'Original bullet — untouched by AI.');
  assert.equal(copy.experience.data[0].bullets[1].text, 'Rewritten bullet, with smart "quotes" and space.');
});

test('SectionEditor wires readability hints and focuses the newly added last bullet textarea', () => {
  const src = fs.readFileSync(path.join(root, 'src/components/builder/SectionEditor.tsx'), 'utf8');
  assert.ok(src.includes('lintBullets'));
  assert.ok(src.includes('lintSummary'));
  assert.ok(src.includes('lintDateRange'));
  assert.ok(src.includes('collectProfileDateStyles'));
  assert.ok(src.includes('fields?.[fields.length - 1]?.focus()'));
});
