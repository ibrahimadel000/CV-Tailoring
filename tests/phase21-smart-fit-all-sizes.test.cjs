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

const { createSampleProfile } = load('mock/profile');
const { estimateResumePages, autoOptimizeTheme, balanceTailoredTheme } = load('services/autoLayout');

const BASE_THEME = {
  accentColor: '#2557a7',
  fontFamily: 'sans',
  fontSize: 'medium',
  lineSpacing: 'normal',
  pageMargins: 'normal',
  layoutStyle: 'modern',
  fitOnePage: false,
  compactCertifications: false,
};

function makeSparseProfile() {
  const p = createSampleProfile('Sparse Fresh Grad');
  p.experience.data = p.experience.data.slice(0, 1);
  p.experience.data[0].bullets = p.experience.data[0].bullets.slice(0, 2);
  p.projects.data = [];
  p.certifications.data = [];
  p.customSections = [];
  return p;
}

function makeTwoPointTwoPageProfile() {
  const p = createSampleProfile('Senior 2.2 Page');
  const templateExp = structuredClone(p.experience.data[0]);
  p.experience.data = Array.from({ length: 7 }, (_, i) => ({
    ...structuredClone(templateExp),
    id: `22222222-2222-4222-8222-22222222220${i}`,
    roleTitle: `Principal Engineer ${i + 1}`,
    companyName: `Company ${i + 1}`,
    bullets: [
      { id: `33333333-3333-4333-8333-33333333330${i}`, text: 'Architected high-throughput distributed pipelines serving 12M daily requests with 99.98% uptime.', isVerified: false },
      { id: `44444444-4444-4444-8444-44444444440${i}`, text: 'Reduced cloud infrastructure spend by 34% by consolidating batch ETL jobs and optimizing query plans.', isVerified: false },
      { id: `55555555-5555-4555-8555-55555555550${i}`, text: 'Mentored 6 engineers across frontend, API, and observability teams to ship quarterly platform milestones.', isVerified: false },
    ],
  }));
  return p;
}

test('autoOptimizeTheme gently expands sparse single-page resumes without overflowing Page 1 or compacting certs', () => {
  const sparse = makeSparseProfile();
  const crampedTheme = { ...BASE_THEME, fitOnePage: true, fontSize: 'small', lineSpacing: 'compact', pageMargins: 'narrow' };
  const before = estimateResumePages(sparse, crampedTheme);
  assert.ok(before < 0.65, `Expected sparse CV < 0.65 pages, got ${before}`);

  const result = autoOptimizeTheme(sparse, crampedTheme, { allowExpand: true });
  assert.equal(result.mode, 'expand');
  assert.equal(result.changed, true);
  assert.equal(result.theme.fitOnePage, false);
  assert.ok(result.estimatedPagesAfter > before);
  assert.ok(result.estimatedPagesAfter <= 0.94, `Expansion must stay safely <= 0.94 pages, got ${result.estimatedPagesAfter}`);
});

test('autoOptimizeTheme compacts 2.01-2.38 page spills onto 2 pages without turning on fitOnePage', () => {
  const senior = makeTwoPointTwoPageProfile();
  const before = estimateResumePages(senior, BASE_THEME);
  assert.ok(before > 2.0 && before <= 2.38, `Expected 2.01-2.38 pages, got ${before}`);

  const result = autoOptimizeTheme(senior, BASE_THEME, { rollbackIfStillOver: true });
  assert.equal(result.mode, 'compact');
  assert.equal(result.targetPages, 2);
  assert.equal(result.changed, true);
  assert.equal(result.rolledBack, false);
  assert.equal(result.theme.fitOnePage, false, '2-page compacting must NOT toggle Fit to 1 page');
  assert.ok(result.estimatedPagesAfter <= 2.0, `Expected <= 2.0 pages, got ${result.estimatedPagesAfter}`);
});

test('autoOptimizeTheme calibrates using real PDF actualPages + lastPageFillRatio', () => {
  const sample = createSampleProfile('Real Geometry Calibrated');
  // Even if estimator thinks it is ~0.95 pages, real PDF reports 2 pages with 12% fill on page 2
  const result = autoOptimizeTheme(sample, BASE_THEME, {
    targetPages: 1,
    allowFitOnePage: true,
    allowExpand: false,
    rollbackIfStillOver: true,
    actualPages: 2,
    lastPageFillRatio: 0.12,
  });
  assert.equal(result.mode, 'compact');
  assert.equal(result.changed, true);
  assert.equal(result.estimatedPagesBefore, 1.12);
  assert.ok(result.estimatedPagesAfter <= 1.0);
});

test('estimateResumePages accounts for stacked photo height and monospace font width', () => {
  const p = createSampleProfile('Photo & Mono');
  const classicNoPhoto = estimateResumePages(p, { ...BASE_THEME, layoutStyle: 'classic' });
  p.resumeHeader.data.photoUrl = 'data:image/png;base64,iVBORw0KGgo=';
  p.resumeHeader.data.showPhoto = true;
  const classicWithPhoto = estimateResumePages(p, { ...BASE_THEME, layoutStyle: 'classic' });
  assert.ok(classicWithPhoto > classicNoPhoto, 'Classic stacked photo should increase estimated page fill');

  const sansPages = estimateResumePages(p, { ...BASE_THEME, fontFamily: 'sans' });
  const monoPages = estimateResumePages(p, { ...BASE_THEME, fontFamily: 'mono' });
  assert.ok(monoPages >= sansPages, 'Monospace should estimate >= sans pages due to wider glyphs');
});

test('balanceTailoredTheme prevents a tailored copy from spilling onto an extra page', () => {
  const source = makeSparseProfile();
  // Build a source right near 0.95 pages
  source.experience.data = createSampleProfile('Base').experience.data.slice(0, 2);
  source.experience.data[1].bullets = source.experience.data[1].bullets.slice(0, 1);
  source.projects.data = [];
  const sourcePages = estimateResumePages(source, BASE_THEME);
  assert.ok(sourcePages <= 1.0, `Expected source <= 1.0, got ${sourcePages}`);

  const tailored = structuredClone(source);
  tailored.experience.data[0].bullets.push(
    { id: '66666666-6666-4666-8666-666666666601', text: 'Delivered cross-functional launch adding telemetry, automated alerting, and zero-downtime rollouts across 4 regions.', isVerified: false },
    { id: '66666666-6666-4666-8666-666666666602', text: 'Partnered with enterprise customers to cut onboarding cycle time by 45% through reusable deployment templates.', isVerified: false },
    { id: '66666666-6666-4666-8666-666666666603', text: 'Authored architecture RFCs and runbooks adopted by 25 engineers across platform and product squads.', isVerified: false },
  );
  const rawTailoredPages = estimateResumePages(tailored, BASE_THEME);
  assert.ok(rawTailoredPages > 1.0, `Expected tailored spill > 1.0, got ${rawTailoredPages}`);

  const balanced = balanceTailoredTheme(source, tailored, BASE_THEME);
  assert.ok(estimateResumePages(tailored, balanced) <= 1.0);
});

test('PaginatedPreview, DesignPanel, import, and tailor workflows wire real-geometry Smart Fit without rollback bypass', () => {
  const preview = fs.readFileSync(path.join(root, 'src/components/builder/PaginatedPreview.tsx'), 'utf8');
  assert.match(preview, /lastPageFillRatio/);
  assert.match(preview, /lastPageLines/);
  assert.match(preview, /Relax spacing/);
  assert.match(preview, /Auto-fit \{targetCompactPages\}/);
  assert.doesNotMatch(preview, /fitOnePage:\s*true,\s*\.\.\.\(certCount/);

  const designPanel = fs.readFileSync(path.join(root, 'src/components/builder/DesignPanel.tsx'), 'utf8');
  assert.match(designPanel, /allowExpand:\s*true/);
  assert.match(designPanel, /result\.mode === 'expand'/);

  const imp = fs.readFileSync(path.join(root, 'src/services/cvImportWorkflow.ts'), 'utf8');
  assert.match(imp, /allowExpand:\s*true/);

  const tw = fs.readFileSync(path.join(root, 'src/services/tailorWorkflow.ts'), 'utf8');
  assert.match(tw, /balanceTailoredTheme/);

  const ce = fs.readFileSync(path.join(root, 'src/services/contentEngine/workflow.ts'), 'utf8');
  assert.match(ce, /balanceTailoredTheme/);

  const rs = fs.readFileSync(path.join(root, 'src/services/resumeComposer/store.ts'), 'utf8');
  assert.match(rs, /balanceTailoredTheme/);
});

test('audit edge cases: blank trailing page triggers compact, failed rollback reverts compactCertifications, and visiblePhoto handles default showPhoto', () => {
  const sample = createSampleProfile('Blank Trailing');
  const blankTrail = autoOptimizeTheme(sample, BASE_THEME, {
    targetPages: 1,
    allowFitOnePage: true,
    allowExpand: false,
    rollbackIfStillOver: true,
    actualPages: 2,
    lastPageFillRatio: 0,
  });
  assert.equal(blankTrail.mode, 'compact');
  assert.equal(blankTrail.changed, true);
  assert.equal(blankTrail.estimatedPagesBefore, 1.01);

  // Stubborn 2.8-page resume with 4 certs targeting 1 page must roll back cleanly (including compactCertifications)
  const huge = makeTwoPointTwoPageProfile();
  huge.certifications.data = [
    { id: '77777777-7777-4777-8777-777777777701', name: 'Cert A', issuer: 'Org', date: '2024' },
    { id: '77777777-7777-4777-8777-777777777702', name: 'Cert B', issuer: 'Org', date: '2024' },
    { id: '77777777-7777-4777-8777-777777777703', name: 'Cert C', issuer: 'Org', date: '2024' },
    { id: '77777777-7777-4777-8777-777777777704', name: 'Cert D', issuer: 'Org', date: '2024' },
  ];
  const rolled = autoOptimizeTheme(huge, BASE_THEME, { targetPages: 1, rollbackIfStillOver: true });
  assert.equal(rolled.rolledBack, true);
  assert.equal(rolled.changed, false);
  assert.equal(rolled.theme.compactCertifications, false);

  // Photo visibility matches visiblePhoto(): showPhoto === undefined with valid data URL counts; invalid http URL does not
  const photoP = createSampleProfile('Photo Visibility');
  const noPhotoEst = estimateResumePages(photoP, { ...BASE_THEME, layoutStyle: 'classic' });
  photoP.resumeHeader.data.photoUrl = 'https://example.com/not-data-uri.png';
  delete photoP.resumeHeader.data.showPhoto;
  assert.equal(estimateResumePages(photoP, { ...BASE_THEME, layoutStyle: 'classic' }), noPhotoEst);
  photoP.resumeHeader.data.photoUrl = 'data:image/png;base64,iVBORw0KGgo=';
  assert.ok(estimateResumePages(photoP, { ...BASE_THEME, layoutStyle: 'classic' }) > noPhotoEst);

  // PaginatedPreview scopes preFitState to profileId so switching profiles never clobbers another profile
  const preview = fs.readFileSync(path.join(root, 'src/components/builder/PaginatedPreview.tsx'), 'utf8');
  assert.match(preview, /preFitState\?\.profileId === profile\.profileId/);
  assert.match(preview, /is blank/);
});
