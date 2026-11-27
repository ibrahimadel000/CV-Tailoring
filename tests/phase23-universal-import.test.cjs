if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { pathToFileURL } = require('node:url');
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

const { importFormat, buildImportedProfile, assessImportQuality } = load('services/cvImportModel');
const { pdfPageLines } = load('services/cvImportLayout');
const { mapAiImportToProfile, hasSubstantiveAiContent } = load('services/cvImportAi');

const BASE_THEME = {
  accentColor: '#2557a7',
  fontFamily: 'sans',
  fontSize: 'medium',
  lineSpacing: 'normal',
  pageMargins: 'normal',
  layoutStyle: 'modern',
};

test('importFormat accepts pdf, docx, txt, md, and png/jpg/webp images while rejecting legacy .doc', () => {
  assert.equal(importFormat('resume.pdf', 1024), 'pdf');
  assert.equal(importFormat('resume.docx', 1024), 'docx');
  assert.equal(importFormat('resume.txt', 1024), 'txt');
  assert.equal(importFormat('resume.md', 1024), 'md');
  assert.equal(importFormat('scan.png', 1024), 'image');
  assert.equal(importFormat('photo.JPG', 1024), 'image');
  assert.equal(importFormat('cv.webp', 1024), 'image');
  assert.throws(() => importFormat('legacy.doc', 1024), /Older \.doc/);
});

test('pdfPageLines detects 2-column gutter even with a full-width footer and word-by-word Canva sidebar spans', () => {
  const items = [];
  // Left narrow sidebar (x = 40..170) with word-by-word spans (each < 12 chars individually!)
  const sidebarRows = [
    ['Skills', 'Summary'],
    ['React', 'TypeScript'],
    ['Node.js', 'Postgres'],
    ['Docker', 'Kubernetes'],
    ['English', 'Fluent'],
    ['Arabic', 'Native'],
  ];
  sidebarRows.forEach((words, idx) => {
    const y = 720 - idx * 24;
    let x = 40;
    for (const w of words) {
      items.push({ str: w, transform: [10, 0, 0, 10, x, y], width: w.length * 5.2, height: 10 });
      x += w.length * 5.2 + 4;
    }
  });
  // Right main column (x = 220..540)
  for (let i = 0; i < 14; i++) {
    const y = 740 - i * 24;
    items.push({
      str: `Senior Engineer delivered scalable platform work line ${i + 1}`,
      transform: [10, 0, 0, 10, 220, y],
      width: 280,
      height: 10,
    });
  }
  // Full-width footer line crossing the gutter at bottom
  items.push({
    str: 'Confidential resume document - page 1 of 2 - generated electronically',
    transform: [9, 0, 0, 9, 40, 40],
    width: 480,
    height: 9,
  });

  const result = pdfPageLines(items, 595, 842, 1);
  assert.equal(result.complex, true, 'Expected 2-column gutter to survive crossing footer and short word spans');
  assert.ok(result.regions.some(r => r.lane === 'left'));
  assert.ok(result.regions.some(r => r.lane === 'right'));
});

test('buildImportedProfile preserves page-2 section continuity and parses FR/DE/ES headings + pageSize', () => {
  const region1 = {
    page: 1,
    lane: 'right',
    text: [
      'Claire Dupont',
      'claire@example.com',
      'Expérience professionnelle',
      'Senior Product Manager | Acme Paris',
      '2021 – Present',
      '• Launched B2B billing platform across 5 European markets.',
    ].join('\n'),
  };
  const region2 = {
    page: 2,
    lane: 'right',
    text: [
      'Product Analyst | Beta Lyon',
      '2018 – 2021',
      '• Reduced churn by 18% via cohort analytics.',
      'Formation',
      'MSc Computer Science | Université de Lyon',
      '2018',
      'Compétences',
      'SQL, Python, Product Strategy',
    ].join('\n'),
  };
  const extracted = {
    text: `${region1.text}\n\n${region2.text}`,
    warnings: [],
    pages: 2,
    pageSize: 'Letter',
    regions: [region1, region2],
  };

  const profile = buildImportedProfile(extracted, 'claire_cv.pdf', 'pdf', BASE_THEME);
  assert.equal(profile.documentTheme.pageSize, 'Letter');
  assert.equal(profile.experience.data.length, 2, 'Page-2 role should continue Experience instead of dropping into Imported details');
  assert.equal(profile.education.data.length, 1);
  assert.ok(profile.skills.data.length >= 3);

  const quality = assessImportQuality(profile, extracted);
  assert.equal(quality.needsAiFallback, false);
});

test('assessImportQuality flags scanned PDFs and blank parses for Tier-2 AI fallback', () => {
  const dummy = buildImportedProfile(
    { text: 'Random unmapped text line one\nRandom unmapped text line two\nRandom unmapped text line three\n', warnings: [] },
    'weird.pdf',
    'pdf',
    BASE_THEME,
  );
  const q1 = assessImportQuality(dummy, { text: 'a\nb\nc', warnings: [] });
  assert.equal(q1.needsAiFallback, true);
  assert.equal(q1.reason, 'no-sections-mapped');

  const q2 = assessImportQuality(dummy, { text: '', warnings: [], needsAiVision: true, images: [{ mimeType: 'image/jpeg', data: 'abc' }] });
  assert.equal(q2.needsAiFallback, true);
  assert.equal(q2.reason, 'scanned-or-image');
});

test('mapAiImportToProfile produces a schema-valid CVProfile with method=ai and preserved pageSize', () => {
  const profile = mapAiImportToProfile(
    {
      name: 'Lukas Weber',
      headline: 'Backend Systems Engineer',
      email: 'lukas@example.de',
      location: 'Berlin, Germany',
      summary: 'Distributed systems engineer specializing in Go and PostgreSQL.',
      experience: [
        {
          roleTitle: 'Senior Backend Engineer',
          companyName: 'CloudWorks GmbH',
          city: 'Berlin',
          startDate: '2022',
          endDate: 'Present',
          bullets: ['Cut p99 latency by 42% on payment ingestion.'],
        },
      ],
      education: [{ degree: 'B.Sc. Informatik', institution: 'TU Berlin', graduationDate: '2020' }],
      skills: [{ name: 'Go', category: 'Technical' }, { name: 'German (Native)', category: 'Languages' }],
      customSections: [{ title: 'Patents', kind: 'list', paragraphs: ['US-1234567 Distributed Lock Engine'] }],
    },
    { text: 'Lukas Weber', warnings: [], pages: 1, pageSize: 'A4', needsAiVision: true },
    'lukas_scan.png',
    'image',
    BASE_THEME,
  );
  assert.equal(profile.resumeHeader.data.name, 'Lukas Weber');
  assert.equal(profile.experience.data.length, 1);
  assert.equal(profile.customSections.length, 1);
  assert.equal(profile.importedFrom.method, 'ai');
  assert.equal(profile.importedFrom.format, 'image');
  assert.equal(profile.documentTheme.pageSize, 'A4');
});

test('server/importHandler.mjs validates methods, unconfigured key, empty body, and CORS cleanly', async () => {
  const { handleImportRequest } = await import(pathToFileURL(path.join(root, 'server/importHandler.mjs')).href);

  const optRes = await handleImportRequest(new Request('http://localhost/api/import-cv', { method: 'OPTIONS' }));
  assert.equal(optRes.status, 204);

  const getRes = await handleImportRequest(new Request('http://localhost/api/import-cv', { method: 'GET' }));
  assert.equal(getRes.status, 405);

  const unconfRes = await handleImportRequest(
    new Request('http://localhost/api/import-cv', { method: 'POST', body: JSON.stringify({ text: 'hello' }) }),
    { apiKey: '' },
  );
  assert.equal(unconfRes.status, 503);

  const emptyRes = await handleImportRequest(
    new Request('http://localhost/api/import-cv', { method: 'POST', body: JSON.stringify({}) }),
    { apiKey: 'AIzaSyFakeConfiguredKeyForUnitTest12345' },
  );
  assert.equal(emptyRes.status, 400);
});

test('UI wires Paste text mode, expanded accept formats, and Hidden badge on Imported details', () => {
  const dialog = fs.readFileSync(path.join(root, 'src/components/builder/ImportCVDialog.tsx'), 'utf8');
  assert.match(dialog, /importPastedCVText/);
  assert.match(dialog, /or paste text/);
  assert.match(dialog, /\.txt,\.md,\.png,\.jpg/);

  const ws = fs.readFileSync(path.join(root, 'src/components/builder/SectionWorkspace.tsx'), 'utf8');
  assert.match(ws, /imported details/);
});

test('audit regressions: createRateLimiter, Node 18 AbortController + mocked Gemini fetch, Bearer auth, and empty {} AI rejection', async () => {
  const { handleImportRequest } = await import(pathToFileURL(path.join(root, 'server/importHandler.mjs')).href);
  const { createRateLimiter } = await import(pathToFileURL(path.join(root, 'server/tailorHandler.mjs')).href);

  const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
  const mockFetch = async () => new Response(JSON.stringify({
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ text: JSON.stringify({ name: 'Sara Ali', email: 'sara@example.com', skills: [{ name: 'SQL', category: 'Technical' }] }) }] },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  // 401 when accessToken is configured and Authorization Bearer is missing
  const unauthRes = await handleImportRequest(
    new Request('http://localhost/api/import-cv', { method: 'POST', body: JSON.stringify({ text: 'Sara Ali' }) }),
    { apiKey: 'AIzaSyFakeConfiguredKeyForUnitTest12345', accessToken: 'secret-tok', rateLimiter: limiter, fetchImpl: mockFetch },
  );
  assert.equal(unauthRes.status, 401);

  // 200 with matching Bearer token + live AbortController signal (verifies Node 18 compatibility) + createRateLimiter
  const ac = new AbortController();
  const okRes = await handleImportRequest(
    new Request('http://localhost/api/import-cv', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-tok' },
      body: JSON.stringify({ text: 'Sara Ali - SQL' }),
      signal: ac.signal,
    }),
    { apiKey: 'AIzaSyFakeConfiguredKeyForUnitTest12345', accessToken: 'secret-tok', rateLimiter: limiter, clientIp: '10.0.0.1', fetchImpl: mockFetch },
  );
  assert.equal(okRes.status, 200);
  const okBody = await okRes.json();
  assert.equal(okBody.parsed.name, 'Sara Ali');

  // Second request from same IP hits 429 rate limit
  const limRes = await handleImportRequest(
    new Request('http://localhost/api/import-cv', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-tok' },
      body: JSON.stringify({ text: 'Sara Ali - SQL' }),
    }),
    { apiKey: 'AIzaSyFakeConfiguredKeyForUnitTest12345', accessToken: 'secret-tok', rateLimiter: limiter, clientIp: '10.0.0.1', fetchImpl: mockFetch },
  );
  assert.equal(limRes.status, 429);

  // Empty {} AI payload must NOT be treated as substantive content
  const emptyProfile = mapAiImportToProfile({}, { text: '', warnings: [] }, 'blank.png', 'image', BASE_THEME);
  assert.equal(hasSubstantiveAiContent(emptyProfile), false);

  // Imported details EyeOff toggle is disabled so it never appears stuck
  const ws = fs.readFileSync(path.join(root, 'src/components/builder/SectionWorkspace.tsx'), 'utf8');
  assert.match(ws, /disabled=\{locked \|\| importedNotes\}/);
});
