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

const { documentThemeSchema } = load('types/schema');
const { themeMetrics } = load('components/builder/resumeModel');
const { RESUME_TEMPLATES, getTemplateMeta } = load('components/builder/templates');
const { autoOptimizeTheme, estimateResumePages } = load('services/autoLayout');
const { buildResumeMarkdown } = load('services/markdownExport');
const { createSampleProfile } = load('mock/profile');

test('documentThemeSchema and themeMetrics support stepped pageMargins (narrow/normal/wide)', () => {
  const base = { accentColor: '#2557a7', fontFamily: 'sans', fontSize: 'medium', lineSpacing: 'normal', layoutStyle: 'modern' };
  assert.equal(documentThemeSchema.safeParse({ ...base, pageMargins: 'narrow' }).success, true);
  assert.equal(documentThemeSchema.safeParse({ ...base, pageMargins: 'wide' }).success, true);
  assert.equal(documentThemeSchema.safeParse({ ...base, pageMargins: 'invalid' }).success, false);

  assert.equal(themeMetrics({ ...base, pageMargins: 'narrow' }).margin, 32);
  assert.equal(themeMetrics({ ...base, pageMargins: 'normal' }).margin, 42);
  assert.equal(themeMetrics({ ...base, pageMargins: 'wide' }).margin, 52);
});

test('autoOptimizeTheme steps through fitOnePage, spacing, and fontSize without no-op pageMargins mutation, and rolls back stubborn spills', () => {
  // Fixture that requires stepping all the way to fontSize to fit on 1 page
  const p = createSampleProfile('Iterative Fit CV');
  p.experience.data = p.experience.data.slice(0, 2);
  p.projects.data = [];
  p.certifications.data = [];
  p.experience.data[0].bullets = Array.from({ length: 7 }, (_, i) => ({
    id: crypto.randomUUID(),
    text: `Delivered cross-functional operational workflow improvement ${i + 1} reducing turnaround latency across regional departments.`,
    isVerified: true,
  }));

  const roomyTheme = {
    accentColor: '#2557a7',
    fontFamily: 'sans',
    fontSize: 'large',
    lineSpacing: 'compact',
    layoutStyle: 'modern',
    pageMargins: 'wide',
  };
  const before = estimateResumePages(p, roomyTheme);
  assert.ok(before > 1.0 && before <= 1.48, `Expected borderline spill (1.01-1.48), got ${before}`);

  const fitted = autoOptimizeTheme(p, roomyTheme);
  assert.equal(fitted.changed, true);
  assert.equal(fitted.rolledBack, false);
  assert.ok(fitted.estimatedPagesAfter <= 1.0, `Expected fitted <= 1.0 page, got ${fitted.estimatedPagesAfter}`);
  // Must NOT overwrite user's saved pageMargins with a no-op while fitOnePage already clamps margins to 32pt
  assert.equal(fitted.theme.pageMargins, 'wide');

  // Unconditional rollback test: content that sits in 1.15-1.45 pages even at small/compact/narrow cannot fit 1 page -> rolls back
  const stubborn = createSampleProfile('Stubborn Spill CV');
  stubborn.certifications.data = [];
  stubborn.projects.data = [];
  stubborn.experience.data = Array.from({ length: 4 }, (_, i) => ({
    id: crypto.randomUUID(),
    roleTitle: `Operations Director ${i + 1}`,
    companyName: `Enterprise Corp ${i + 1}`,
    startDate: '2020',
    endDate: '2025',
    bullets: Array.from({ length: 4 }, (_, j) => ({
      id: crypto.randomUUID(),
      text: `Led regional compliance audit and budget forecasting stream ${j + 1} across twelve operating divisions with measurable savings.`,
      isVerified: true,
    })),
  }));
  const tightTheme = {
    accentColor: '#2557a7',
    fontFamily: 'sans',
    fontSize: 'small',
    lineSpacing: 'compact',
    layoutStyle: 'minimal',
    pageMargins: 'narrow',
  };
  const stubbornBefore = estimateResumePages(stubborn, tightTheme);
  assert.ok(stubbornBefore > 1.0 && stubbornBefore <= 1.48, `Expected stubborn spill in 1.01-1.48, got ${stubbornBefore}`);
  const rolled = autoOptimizeTheme(stubborn, tightTheme);
  assert.equal(rolled.rolledBack, true);
  assert.equal(rolled.changed, false);
  assert.equal(rolled.theme.fitOnePage, undefined);
});

test('RESUME_TEMPLATES single-source metadata covers all active templates and falls back safely for legacy split', () => {
  assert.ok(RESUME_TEMPLATES.length >= 3);
  assert.ok(RESUME_TEMPLATES.every(t => t.atsSafe && t.columns === 1));
  assert.equal(getTemplateMeta('classic').name, 'Editorial');
  assert.equal(getTemplateMeta('minimal').name, 'Compact');
  assert.equal(getTemplateMeta('split').name, 'Essential');
});

test('buildResumeMarkdown escapes URL parens & inline emphasis and preserves localized section titles', () => {
  const p = createSampleProfile('Jordan Rivera');
  p.resumeHeader.data.firstName = 'Jordan';
  p.resumeHeader.data.lastName = 'Rivera';
  p.resumeHeader.data.name = 'Jordan Rivera';
  p.resumeHeader.data.desiredJobPosition = 'Operations *Lead*';
  p.resumeHeader.data.email = 'jordan@example.com';
  p.resumeHeader.data.portfolio = 'https://en.wikipedia.org/wiki/Engineer_(title)';
  p.resumeHeader.data.showPortfolio = true;
  p.experience.title = 'الخبرات العملية';

  const md = buildResumeMarkdown(p);
  assert.ok(md.startsWith('# Jordan Rivera\n'));
  assert.ok(md.includes('**Operations \\*Lead\\***'));
  assert.ok(md.includes('[jordan@example.com](mailto:jordan@example.com)'));
  assert.ok(md.includes('(https://en.wikipedia.org/wiki/Engineer_%28title%29)'));
  assert.ok(md.includes('## الخبرات العملية'));
  assert.ok(md.includes('\n- '));
});

test('DesignPanel, PaginatedPreview, and BuilderStudio wire template filters, pageMargins, resetAutoFit, and Markdown export', () => {
  const designSrc = fs.readFileSync(path.join(root, 'src/components/builder/DesignPanel.tsx'), 'utf8');
  assert.ok(designSrc.includes('template-filter-chips'));
  assert.ok(designSrc.includes('disabled={Boolean(theme.fitOnePage)}'));
  assert.ok(designSrc.includes('activeHiddenByFilter'));

  const previewSrc = fs.readFileSync(path.join(root, 'src/components/builder/PaginatedPreview.tsx'), 'utf8');
  assert.ok(previewSrc.includes('preFitState') || previewSrc.includes('preFitThemeRef'));
  assert.ok(previewSrc.includes('resetAutoFit'));

  const studioSrc = fs.readFileSync(path.join(root, 'src/components/builder/BuilderStudio.tsx'), 'utf8');
  assert.ok(studioSrc.includes('buildResumeMarkdownBlob'));
  assert.ok(studioSrc.includes('Download Markdown (.md)'));
});
