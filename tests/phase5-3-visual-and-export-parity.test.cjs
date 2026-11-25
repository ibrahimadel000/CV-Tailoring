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
    .replaceAll('import.meta.env.VITE_GEMINI_API_KEY', "''");
  m._compile(ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file);
  return m.exports;
}

const { fullName, contactItems } = load('components/builder/resumeModel');
const { buildResumeDocxBytes } = load('services/docxExport');
const { createSampleProfile } = load('mock/profile');

const baseTheme = {
  accentColor: '#2557a7',
  fontFamily: 'sans',
  fontSize: 'medium',
  lineSpacing: 'normal',
  layoutStyle: 'modern',
};

test('fullName strips whitespace-only suffixName and contactItems produces safe clickable URLs', () => {
  const p = createSampleProfile('Header Parity');
  p.resumeHeader.data.firstName = 'Jane';
  p.resumeHeader.data.lastName = 'Doe';
  p.resumeHeader.data.showSuffixName = true;
  p.resumeHeader.data.suffixName = '   ';
  p.resumeHeader.data.email = 'jane@example.com';
  p.resumeHeader.data.linkedin = 'linkedin.com/in/janedoe';
  p.resumeHeader.data.portfolio = 'javascript:alert(1)';

  assert.equal(fullName(p), 'Jane Doe');
  const items = contactItems(p);
  assert.equal(items.find(i => i.label === 'jane@example.com')?.url, 'mailto:jane@example.com');
  assert.equal(items.find(i => i.label === 'linkedin.com/in/janedoe')?.url, 'https://linkedin.com/in/janedoe');
  assert.equal(items.find(i => i.label === 'javascript:alert(1)')?.url, null);
});

test('DOCX export uses Arial, 2-column compactCertifications table, RTL header without forced left align, and lifts entry-0 pageBreak', () => {
  const p = createSampleProfile('Parity DOCX');
  p.resumeHeader.data.firstName = 'إبراهيم';
  p.resumeHeader.data.lastName = 'عادل';
  p.certifications.data = [
    { id: crypto.randomUUID(), name: 'AWS SAA', issuer: 'Amazon', date: '2025' },
    { id: crypto.randomUUID(), name: 'GCP ACE', issuer: 'Google', date: '2024' },
    { id: crypto.randomUUID(), name: 'CKAD', issuer: 'CNCF', date: '2024' },
  ];
  p.customSections = [
    { id: crypto.randomUUID(), title: '   ', kind: 'text', paragraphs: ['Extra info item'] },
  ];
  const firstExpId = p.experience.data[0].id;
  p.pageLayout = { entries: { [firstExpId]: 'new-page' } };

  const bytes = buildResumeDocxBytes(p, { ...baseTheme, compactCertifications: true });
  const unzipped = unzipSync(bytes);
  const docXml = strFromU8(unzipped['word/document.xml']);
  const stylesXml = strFromU8(unzipped['word/styles.xml']);

  assert.ok(stylesXml.includes('w:ascii="Arial"'));
  assert.ok(docXml.includes('<w:tbl>'), 'Expected 2-column borderless table for compactCertifications');
  assert.ok(docXml.includes('<w:cantSplit/>'));
  assert.equal(docXml.includes('<w:jc w:val="left"/>'), false, 'Modern RTL header must not force left alignment');
  assert.ok(docXml.includes('Additional information'));
  // Entry-0 pageBreakBefore should be lifted onto the Experience section heading.
  assert.match(docXml, /<w:pStyle w:val="Heading1"\/><w:keepNext\/><w:keepLines\/><w:pageBreakBefore\/>/);
});
