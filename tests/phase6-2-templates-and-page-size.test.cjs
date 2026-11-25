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

const { documentThemeSchema } = load('types/schema');
const { themeMetrics } = load('components/builder/resumeModel');
const { buildResumeDocxBytes } = load('services/docxExport');
const { createSampleProfile } = load('mock/profile');

const baseTheme = {
  accentColor: '#1e293b',
  fontFamily: 'sans',
  fontSize: 'medium',
  lineSpacing: 'normal',
  layoutStyle: 'modern',
};

test('documentThemeSchema supports optional pageSize while staying backward-compatible with legacy 5-key themes', () => {
  const legacyParsed = documentThemeSchema.safeParse(baseTheme);
  assert.equal(legacyParsed.success, true);
  assert.equal('pageSize' in legacyParsed.data, false);

  const letterParsed = documentThemeSchema.safeParse({ ...baseTheme, pageSize: 'Letter' });
  assert.equal(letterParsed.success, true);
  assert.equal(letterParsed.data.pageSize, 'Letter');
});

test('themeMetrics differentiates modern, classic, and minimal templates and computes A4 vs Letter dimensions', () => {
  const modern = themeMetrics({ ...baseTheme, layoutStyle: 'modern' });
  const classic = themeMetrics({ ...baseTheme, layoutStyle: 'classic', fontFamily: 'serif' });
  const minimal = themeMetrics({ ...baseTheme, layoutStyle: 'minimal', pageSize: 'Letter' });

  assert.equal(modern.pageWidthPt, 595.28);
  assert.equal(modern.sectionRuleColor, '#CBD5E1');
  assert.equal(modern.subtitleItalic, false);

  assert.equal(classic.subtitleItalic, true);
  assert.equal(classic.italic, 'Times-Italic');
  assert.equal(classic.sectionRuleColor, '#1e293b');

  assert.equal(minimal.sectionBgColor, '#F1F5F9');
  assert.equal(minimal.pageWidthPt, 612);
  assert.equal(minimal.pageHeightPt, 792);
});

test('DOCX exporter honors theme.pageSize=Letter and emits ATS-safe <w:shd> section bands in minimal template', () => {
  const p = createSampleProfile('Template Parity');
  const bytes = buildResumeDocxBytes(p, { ...baseTheme, layoutStyle: 'minimal', pageSize: 'Letter' });
  const docXml = strFromU8(unzipSync(bytes)['word/document.xml']);

  assert.ok(docXml.includes('w:w="12240" w:h="15840"'), 'Expected US Letter page dimensions from theme.pageSize');
  assert.ok(docXml.includes('<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>'), 'Expected minimal template shading');
});
