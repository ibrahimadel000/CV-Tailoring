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

const { documentThemeSchema } = load('types/schema');
const { RESUME_TEMPLATES, getTemplateMeta } = load('components/builder/templates');
const { themeMetrics } = load('components/builder/resumeModel');
const { estimateResumePages } = load('services/autoLayout');
const { buildResumeDocxBytes } = load('services/docxExport');
const { createSampleProfile } = load('mock/profile');

test('documentThemeSchema and RESUME_TEMPLATES register 5 ATS-safe 1-column templates including Technical and Executive', () => {
  const base = { accentColor: '#2557a7', fontFamily: 'sans', fontSize: 'medium', lineSpacing: 'normal' };
  assert.equal(documentThemeSchema.safeParse({ ...base, layoutStyle: 'technical' }).success, true);
  assert.equal(documentThemeSchema.safeParse({ ...base, layoutStyle: 'executive' }).success, true);

  assert.equal(RESUME_TEMPLATES.length, 5);
  assert.ok(RESUME_TEMPLATES.every(t => t.atsSafe && t.columns === 1));
  assert.equal(getTemplateMeta('technical').name, 'Technical');
  assert.equal(getTemplateMeta('executive').name, 'Executive');
});

test('themeMetrics differentiates Technical (split/single-line) and Executive (centered/framed) and Technical saves vertical space', () => {
  const base = { accentColor: '#2557a7', fontFamily: 'sans', fontSize: 'medium', lineSpacing: 'normal' };
  const tech = themeMetrics({ ...base, layoutStyle: 'technical' });
  const exec = themeMetrics({ ...base, layoutStyle: 'executive' });
  const mod = themeMetrics({ ...base, layoutStyle: 'modern' });

  assert.equal(tech.splitHeader, true);
  assert.equal(tech.singleLineEntryHeader, true);
  assert.equal(tech.margin, 36);

  assert.equal(exec.centeredHeader, true);
  assert.equal(exec.framedContactBar, true);
  assert.equal(exec.subtitleItalic, true);
  assert.equal(exec.margin, 44);

  const p = createSampleProfile('Space Check');
  const techPages = estimateResumePages(p, { ...base, layoutStyle: 'technical' });
  const modPages = estimateResumePages(p, { ...base, layoutStyle: 'modern' });
  assert.ok(techPages < modPages, `Expected Technical (${techPages}) < Essential (${modPages})`);
});

test('DOCX export renders Technical single-line experience headers and Executive framed contact bar', () => {
  const p = createSampleProfile('Template DOCX');
  p.resumeHeader.data.email = 'alex@example.com';

  const techBytes = buildResumeDocxBytes(p, {
    accentColor: '#2557a7',
    fontFamily: 'sans',
    fontSize: 'medium',
    lineSpacing: 'normal',
    layoutStyle: 'technical',
  });
  const techXml = strFromU8(unzipSync(techBytes)['word/document.xml']);
  // Concrete single-line Experience and Education headers in Technical DOCX
  const firstCompany = p.experience.data[0].companyName;
  const firstSchool = p.education.data[0].institution;
  assert.ok(techXml.includes(` — ${firstCompany}`));
  assert.ok(techXml.includes(` — ${firstSchool}`));

  const execBytes = buildResumeDocxBytes(p, {
    accentColor: '#2557a7',
    fontFamily: 'serif',
    fontSize: 'medium',
    lineSpacing: 'normal',
    layoutStyle: 'executive',
  });
  const execXml = strFromU8(unzipSync(execBytes)['word/document.xml']);
  // Framed contact bar top + bottom hairline border
  assert.ok(execXml.includes('<w:top w:val="single" w:sz="6" w:space="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="6" w:space="4" w:color="CBD5E1"/>'));

  // Empty-contact Executive still gets a clean 1pt (sz="8") fallback divider
  const noContact = createSampleProfile('No Contacts');
  noContact.resumeHeader.data.email = '';
  noContact.resumeHeader.data.phone = '';
  noContact.resumeHeader.data.location = '';
  noContact.resumeHeader.data.linkedin = '';
  noContact.resumeHeader.data.github = '';
  noContact.resumeHeader.data.portfolio = '';
  noContact.resumeHeader.data.otherUrl = '';
  const noContactXml = strFromU8(unzipSync(buildResumeDocxBytes(noContact, {
    accentColor: '#2557a7', fontFamily: 'serif', fontSize: 'medium', lineSpacing: 'normal', layoutStyle: 'executive',
  }))['word/document.xml']);
  assert.ok(noContactXml.includes('<w:bottom w:val="single" w:sz="8" w:space="6" w:color="2557A7"/>'));
});

test('BuilderPDF and ResumePaper wire splitHeader, framedContactBar, and singleLineEntryHeader', () => {
  const pdfSrc = fs.readFileSync(path.join(root, 'src/components/builder/BuilderPDF.tsx'), 'utf8');
  assert.ok(pdfSrc.includes('m.splitHeader'));
  assert.ok(pdfSrc.includes('m.framedContactBar'));
  assert.ok(pdfSrc.includes('m.singleLineEntryHeader'));

  const paperSrc = fs.readFileSync(path.join(root, 'src/components/builder/ResumePaper.tsx'), 'utf8');
  assert.ok(paperSrc.includes('paper-split-header'));
  assert.ok(paperSrc.includes('paper-framed-contacts'));
  assert.ok(paperSrc.includes('m.singleLineEntryHeader'));
});
