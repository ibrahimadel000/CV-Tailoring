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

const { buildResumeDocxBytes, escapeXml, normalizeExternalUrl } = load('services/docxExport');
const { createSampleProfile } = load('mock/profile');

const baseTheme = {
  accentColor: '#2557a7',
  fontFamily: 'sans',
  fontSize: 'medium',
  lineSpacing: 'normal',
  layoutStyle: 'modern',
};

test('buildResumeDocxBytes outputs a valid 5-part OOXML ZIP with sectPr last and valid hyperlink rels', () => {
  const p = createSampleProfile('DOCX Structure');
  p.resumeHeader.data.email = 'alex@example.com';
  p.resumeHeader.data.linkedin = 'linkedin.com/in/alex';
  p.resumeHeader.data.github = 'https://github.com/alex';
  p.projects.data = [{
    id: crypto.randomUUID(),
    name: 'Atlas Engine',
    role: 'Lead',
    url: 'atlas.example.com',
    bullets: [{ id: crypto.randomUUID(), text: 'Built streaming ingestion pipeline.', isVerified: true }],
  }];

  const bytes = buildResumeDocxBytes(p, baseTheme);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);

  const entries = unzipSync(bytes);
  const names = Object.keys(entries).sort();
  assert.deepEqual(names, [
    '[Content_Types].xml',
    '_rels/.rels',
    'word/_rels/document.xml.rels',
    'word/document.xml',
    'word/styles.xml',
  ]);

  const docXml = strFromU8(entries['word/document.xml']);
  const relsXml = strFromU8(entries['word/_rels/document.xml.rels']);

  for (const [name, data] of Object.entries(entries)) {
    const text = strFromU8(data);
    assert.equal(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/.test(text), false, `Illegal XML char in ${name}`);
  }

  assert.match(docXml, /<w:sectPr>[\s\S]*?<\/w:sectPr>\s*<\/w:body>/);

  const usedIds = [...docXml.matchAll(/r:id="(rId\d+)"/g)].map(m => m[1]);
  assert.ok(usedIds.length >= 3, 'Expected email, linkedin, github, and project URL hyperlinks');
  assert.match(relsXml, /Id="rId1"[^>]*Target="styles\.xml"/);
  for (const id of usedIds) {
    const re = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"[^>]*TargetMode="External"`);
    const match = relsXml.match(re);
    assert.ok(match, `Missing external relationship for ${id}`);
    assert.match(match[1], /^(https?:|mailto:)/);
  }
});

test('DOCX exporter sanitizes XML special characters, control bytes, and lone surrogates', () => {
  const p = createSampleProfile('Sanitization');
  p.resumeHeader.data.firstName = 'Alex & Sam';
  p.resumeHeader.data.lastName = '<Lead>';
  p.summary.data = 'R&D "systems" \'core\' \x00\x0B\x1F' + '\uD800' + ' end.';

  const bytes = buildResumeDocxBytes(p, baseTheme);
  const docXml = strFromU8(unzipSync(bytes)['word/document.xml']);

  assert.ok(docXml.includes('Alex &amp; Sam &lt;Lead&gt;'));
  assert.ok(docXml.includes('R&amp;D &quot;systems&quot; &apos;core&apos;'));
  assert.equal(/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(docXml), false);
  assert.equal(escapeXml('a&b<c>'), 'a&amp;b&lt;c&gt;');
  assert.equal(normalizeExternalUrl('javascript:alert(1)'), null);
  assert.equal(normalizeExternalUrl('github.com/user'), 'https://github.com/user');
  assert.equal(normalizeExternalUrl('user@example.com', 'email'), 'mailto:user@example.com');
});

test('DOCX exporter supports fitOnePage, Letter vs A4, Arabic/RTL, custom sections, and skips Imported details', () => {
  const p = createSampleProfile('Full Features');
  p.resumeHeader.data.firstName = 'إبراهيم';
  p.resumeHeader.data.lastName = 'عادل';
  p.resumeHeader.data.email = 'ibrahim@example.com';
  p.resumeHeader.data.location = 'الرياض، السعودية';
  p.summary.data = 'مهندس برمجيات متخصص في بناء الأنظمة السحابية.';
  p.customSections = [
    { id: crypto.randomUUID(), title: 'Imported details', kind: 'text', paragraphs: ['SECRET_SHOULD_NOT_APPEAR'] },
    { id: crypto.randomUUID(), title: 'Publications', kind: 'list', paragraphs: ['Distributed Systems Paper'] },
    { id: crypto.randomUUID(), title: 'Languages', kind: 'skills', paragraphs: ['Arabic', 'English'] },
    {
      id: crypto.randomUUID(),
      title: 'Volunteering',
      kind: 'experience',
      paragraphs: [],
      entries: [{
        id: crypto.randomUUID(),
        title: 'Mentor',
        organization: 'Code Club',
        startDate: '2024',
        endDate: '2025',
        description: 'Mentored junior developers.',
      }],
    },
  ];
  p.pageLayout = { sections: { education: 'new-page' } };

  const bytesA4Fit = buildResumeDocxBytes(p, { ...baseTheme, fitOnePage: true, compactCertifications: true }, { pageSize: 'A4' });
  const docA4Fit = strFromU8(unzipSync(bytesA4Fit)['word/document.xml']);
  assert.ok(docA4Fit.includes('w:w="11906"'));
  assert.ok(docA4Fit.includes('w:left="520"'));
  assert.ok(docA4Fit.includes('<w:bidi/>'));
  assert.ok(docA4Fit.includes('<w:rtl/>'));
  assert.ok(docA4Fit.includes('<w:rtl w:val="0"/>'));
  assert.ok(docA4Fit.includes('<w:pageBreakBefore/>'));
  assert.ok(docA4Fit.includes('Distributed Systems Paper'));
  assert.ok(docA4Fit.includes('Arabic · English'));
  assert.ok(docA4Fit.includes('Code Club'));
  assert.equal(docA4Fit.includes('SECRET_SHOULD_NOT_APPEAR'), false);

  const bytesLetter = buildResumeDocxBytes(p, baseTheme, { pageSize: 'Letter' });
  const docLetter = strFromU8(unzipSync(bytesLetter)['word/document.xml']);
  assert.ok(docLetter.includes('w:w="12240"'));
});
