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

const { resumeBlocks, themeMetrics } = load('components/builder/resumeModel');
const { buildResumeDocxBytes } = load('services/docxExport');
const { buildResumeMarkdown } = load('services/markdownExport');
const { createSampleProfile } = load('mock/profile');

test('themeMetrics scales sectionTitleSize strictly above body copy across Small, Medium, Large, and Fit-to-1-page', () => {
  const base = { accentColor: '#2557a7', fontFamily: 'sans', lineSpacing: 'normal', layoutStyle: 'modern' };
  for (const fontSize of ['small', 'medium', 'large']) {
    const m = themeMetrics({ ...base, fontSize });
    assert.ok(m.sectionTitleSize > m.size, `Expected sectionTitleSize (${m.sectionTitleSize}) > body (${m.size}) for ${fontSize}`);
    const mFit = themeMetrics({ ...base, fontSize, fitOnePage: true });
    assert.ok(mFit.sectionTitleSize > mFit.size, `Expected fit sectionTitleSize (${mFit.sectionTitleSize}) > body (${mFit.size}) for ${fontSize}`);
  }
});

test('resumeBlocks respects custom/localized built-in section titles and extracts clickable project URLs', () => {
  const p = createSampleProfile('Parity Check');
  p.experience.title = 'الخبرات العملية';
  p.projects.data = [{
    id: crypto.randomUUID(),
    name: 'Folio App',
    role: 'Lead Creator',
    url: 'github.com/example/folio',
    bullets: [{ id: crypto.randomUUID(), text: 'Built browser-local resume builder.', isVerified: true }],
  }];

  const blocks = resumeBlocks(p);
  assert.equal(blocks.find(b => b.id === 'experience')?.title, 'الخبرات العملية');
  const projItem = blocks.find(b => b.id === 'projects')?.items[0];
  assert.equal(projItem?.subtitle, 'Lead Creator');
  assert.equal(projItem?.url, 'https://github.com/example/folio');
  assert.equal(projItem?.urlLabel, 'github.com/example/folio');

  const md = buildResumeMarkdown(p);
  assert.ok(md.includes('[github.com/example/folio](https://github.com/example/folio)'));
});

test('DOCX export applies scaled heading size, letter-spacing tracking, muted non-underlined contact links, and minimal heading padding', () => {
  const p = createSampleProfile('DOCX Parity');
  p.resumeHeader.data.email = 'alex@example.com';
  p.resumeHeader.data.linkedin = 'linkedin.com/in/alex';
  p.resumeHeader.data.showLinkedin = true;

  const bytes = buildResumeDocxBytes(p, {
    accentColor: '#2557a7',
    fontFamily: 'sans',
    fontSize: 'medium',
    lineSpacing: 'normal',
    layoutStyle: 'minimal',
  });
  const files = unzipSync(bytes);
  const docXml = strFromU8(files['word/document.xml']);

  // Scaled heading size (11.5pt = 23 half-points) and tracking (<w:spacing w:val="14"/>)
  assert.ok(docXml.includes('<w:sz w:val="23"/>'));
  assert.ok(docXml.includes('<w:color w:val="2557A7"/><w:spacing w:val="14"/>'));
  // Muted non-underlined contact hyperlinks
  assert.ok(docXml.includes('<w:color w:val="526074"/>'));
  assert.ok(docXml.includes('<w:u w:val="none"/>'));
  // Minimal shaded heading top/bottom padding borders
  assert.ok(docXml.includes('<w:top w:val="single" w:sz="18" w:space="2" w:color="F1F5F9"/>'));
});

test('BuilderPDF and ResumePaper enforce entry title contrast, right-aligned dates, clickable project links, and A4/Letter parity', () => {
  const pdfSrc = fs.readFileSync(path.join(root, 'src/components/builder/BuilderPDF.tsx'), 'utf8');
  assert.ok(pdfSrc.includes('fontSize: m.sectionTitleSize'));
  assert.ok(pdfSrc.includes("color: '#172337', flex: 1"));
  assert.ok(pdfSrc.includes("textAlign: 'right'"));
  assert.ok(pdfSrc.includes('item.url ? <Link src={item.url}'));

  const paperSrc = fs.readFileSync(path.join(root, 'src/components/builder/ResumePaper.tsx'), 'utf8');
  assert.ok(paperSrc.includes('width: ptToPx(m.pageWidthPt)'));
  assert.ok(paperSrc.includes("'--bullet-color': m.bulletColor"));
  assert.ok(paperSrc.includes('fontSize: ptToPx(m.sectionTitleSize)'));
  assert.ok(paperSrc.includes('item.url ? ('));
  assert.ok(paperSrc.includes('<header data-resume-section="personal"'));
});
