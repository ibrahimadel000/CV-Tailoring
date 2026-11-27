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
const { buildResumeDocxBytes } = load('services/docxExport');
const { splitLongTokenForPDF } = load('components/builder/resumeModel');

const BASE_THEME = {
  accentColor: '#2557a7',
  fontFamily: 'sans',
  fontSize: 'medium',
  lineSpacing: 'normal',
  pageMargins: 'normal',
  layoutStyle: 'modern',
};

// Minimal valid 1x1 PNG base64
const TINY_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('DOCX export embeds visible profile photo in word/media/photo.png with valid rels & content types', () => {
  const p = createSampleProfile('Photo DOCX');
  p.resumeHeader.data.photoUrl = TINY_PNG_DATA_URI;
  p.resumeHeader.data.showPhoto = true;

  // Side-by-side modern header with photo
  const modernZip = unzipSync(buildResumeDocxBytes(p, { ...BASE_THEME, layoutStyle: 'modern' }));
  assert.ok(modernZip['word/media/photo.png'], 'Expected word/media/photo.png in ZIP');
  const ctXml = strFromU8(modernZip['[Content_Types].xml']);
  assert.match(ctXml, /Extension="png" ContentType="image\/png"/);
  const relsXml = strFromU8(modernZip['word/_rels/document.xml.rels']);
  assert.match(relsXml, /relationships\/image" Target="media\/photo\.png"/);
  const docXml = strFromU8(modernZip['word/document.xml']);
  assert.match(docXml, /<w:drawing>/);
  assert.match(docXml, /xmlns:wp="http:\/\/schemas\.openxmlformats\.org\/drawingml\/2006\/wordprocessingDrawing"/);

  // Centered classic header with photo
  const classicZip = unzipSync(buildResumeDocxBytes(p, { ...BASE_THEME, layoutStyle: 'classic' }));
  assert.ok(classicZip['word/media/photo.png']);
  const classicDoc = strFromU8(classicZip['word/document.xml']);
  assert.match(classicDoc, /<w:keepNext\/><w:spacing w:before="0" w:after="100"\/><w:jc w:val="center"\/><\/w:pPr><w:r><w:drawing>/);

  // Hidden photo is NOT embedded
  p.resumeHeader.data.showPhoto = false;
  const noPhotoZip = unzipSync(buildResumeDocxBytes(p, BASE_THEME));
  assert.equal(noPhotoZip['word/media/photo.png'], undefined);
});

test('DOCX export hoists Education & Custom Experience first-entry page breaks onto section heading and adds keepLines + bidiVisual', () => {
  const p = createSampleProfile('Orphan & RTL DOCX');
  const firstEduId = p.education.data[0].id;
  p.customSections = [
    {
      id: '88888888-8888-4888-8888-888888888801',
      title: 'Leadership',
      kind: 'experience',
      paragraphs: [],
      entries: [
        {
          id: '88888888-8888-4888-8888-888888888802',
          title: 'Chapter Lead',
          organization: 'Tech Guild',
          startDate: '2023',
          endDate: '2025',
          description: 'First paragraph.\n\nSecond paragraph.',
        },
      ],
    },
  ];
  p.certifications.data = [
    { id: '88888888-8888-4888-8888-888888888803', name: 'شهادة معمارية السحابة', issuer: 'أمازون', date: '2025' },
    { id: '88888888-8888-4888-8888-888888888804', name: 'شهادة أمن المعلومات', issuer: 'معهد', date: '2024' },
  ];
  p.pageLayout = {
    sections: {},
    entries: {
      [firstEduId]: 'new-page',
      '88888888-8888-4888-8888-888888888802': 'new-page',
    },
  };

  const zip = unzipSync(buildResumeDocxBytes(p, { ...BASE_THEME, compactCertifications: true }));
  const xml = strFromU8(zip['word/document.xml']);

  // Education heading gets pageBreakBefore (not stranded)
  const eduIdx = xml.indexOf('>Education<');
  assert.ok(eduIdx > 0);
  const eduWindow = xml.slice(Math.max(0, eduIdx - 420), eduIdx);
  assert.match(eduWindow, /<w:pageBreakBefore\/>/);

  // Leadership heading gets pageBreakBefore
  const leadIdx = xml.indexOf('>Leadership<');
  assert.ok(leadIdx > 0);
  const leadWindow = xml.slice(Math.max(0, leadIdx - 420), leadIdx);
  assert.match(leadWindow, /<w:pageBreakBefore\/>/);

  // RTL compactCertifications table has <w:bidiVisual/>
  assert.match(xml, /<w:bidiVisual\/>/);

  // Title/date line has <w:keepLines/>
  const titleIdx = xml.indexOf('>Chapter Lead<');
  assert.ok(titleIdx > 0);
  const titleWindow = xml.slice(Math.max(0, titleIdx - 260), titleIdx);
  assert.match(titleWindow, /<w:keepLines\/>/);

  // Multi-paragraph body text does NOT force keepNext on first paragraph
  const firstParaIdx = xml.indexOf('>First paragraph.<');
  assert.ok(firstParaIdx > 0);
  const firstParaWindow = xml.slice(Math.max(0, firstParaIdx - 200), firstParaIdx);
  assert.doesNotMatch(firstParaWindow, /<w:keepNext\/>/);
});

test('BuilderPDF, ResumePaper, and index.css enforce URL wrapping, lower keepTogether/together thresholds, and HTML/RTL parity', () => {
  const pdfSrc = fs.readFileSync(path.join(root, 'src/components/builder/BuilderPDF.tsx'), 'utf8');
  assert.match(pdfSrc, /Font\.registerHyphenationCallback\(splitLongTokenForPDF\)/);
  assert.match(pdfSrc, /bodyHeight \* 0\.42/);
  assert.match(pdfSrc, /bodyHeight \* 0\.35/);
  assert.match(pdfSrc, /photo && headerContacts\.length >= 4 \? '38%' : '46%'/);

  const paperSrc = fs.readFileSync(path.join(root, 'src/components/builder/ResumePaper.tsx'), 'utf8');
  assert.match(paperSrc, /sidePhotoWithContacts/);
  assert.match(paperSrc, /hasFramedContacts = m\.framedContactBar && headerContacts\.length > 0/);
  assert.match(paperSrc, /showContacts = headerContacts\.length > 0 \|\| blocks\.length === 0/);

  const cssSrc = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
  assert.match(cssSrc, /\.paper-edit\s*\{[^}]*text-align:\s*start/);
  assert.match(cssSrc, /\.paper-item-heading > span\s*\{[^}]*text-align:\s*end/);
  assert.match(cssSrc, /padding-inline-start:\s*15px/);
  assert.match(cssSrc, /\.paper-header-col\s*\{/);
});

test('splitLongTokenForPDF keeps normal words intact while safely wrapping URLs, bare domains, emails, and long hashes', () => {
  // Normal words stay unbroken
  assert.deepEqual(splitLongTokenForPDF('collaboration'), ['collaboration']);
  assert.deepEqual(splitLongTokenForPDF('cross-functional-architecture-design'), ['cross-functional-architecture-design']);

  // Bare 25-36 char domain splits cleanly (catches \b regression)
  const domainParts = splitLongTokenForPDF('my-long-portfolio-domain.com');
  assert.ok(domainParts.length > 1, `Expected bare domain to split, got ${JSON.stringify(domainParts)}`);
  assert.equal(domainParts.join(''), 'my-long-portfolio-domain.com');

  // Long URL with oversized trailing hash splits AND chunks the trailing segment
  const url = 'https://example.com/projects/abcdef0123456789abcdef0123456789abcdef0123456789';
  const urlParts = splitLongTokenForPDF(url);
  assert.ok(urlParts.length >= 4);
  assert.equal(urlParts.join(''), url);
  assert.ok(urlParts.every(part => part.length <= 36));

  // Long email splits cleanly
  const email = 'alexander.montgomery.dev@enterprise-cloud.io';
  const emailParts = splitLongTokenForPDF(email);
  assert.ok(emailParts.length > 1);
  assert.equal(emailParts.join(''), email);

  // 45-char unbroken token chunks cleanly
  const token = 'a'.repeat(45);
  const tokenParts = splitLongTokenForPDF(token);
  assert.deepEqual(tokenParts, ['a'.repeat(20), 'a'.repeat(20), 'a'.repeat(5)]);
});

test('DOCX photo supports circle (ellipse) shape and empty-header photo fallback without dangling media', () => {
  const p = createSampleProfile('Circle & Empty Header');
  p.resumeHeader.data.photoUrl = TINY_PNG_DATA_URI;
  p.resumeHeader.data.showPhoto = true;
  p.resumeHeader.data.photoShape = 'circle';

  const circleDoc = strFromU8(unzipSync(buildResumeDocxBytes(p, BASE_THEME))['word/document.xml']);
  assert.match(circleDoc, /<a:prstGeom prst="ellipse">/);
  assert.match(circleDoc, /<wp:effectExtent l="0" t="0" r="0" b="0"\/>/);

  // Empty header text + photo on non-centered template still emits <w:drawing> (no dangling rId)
  p.resumeHeader.data.firstName = '';
  p.resumeHeader.data.lastName = '';
  p.resumeHeader.data.name = '';
  p.resumeHeader.data.desiredJobPosition = '';
  p.headline.data = '';
  p.resumeHeader.data.email = '';
  p.resumeHeader.data.phone = '';
  p.resumeHeader.data.location = '';
  p.resumeHeader.data.linkedin = '';
  p.resumeHeader.data.github = '';
  p.resumeHeader.data.portfolio = '';
  p.resumeHeader.data.otherUrl = '';
  const photoOnlyDoc = strFromU8(unzipSync(buildResumeDocxBytes(p, { ...BASE_THEME, layoutStyle: 'modern' }))['word/document.xml']);
  assert.match(photoOnlyDoc, /<w:drawing>/);
});
