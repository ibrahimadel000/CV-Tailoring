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
    .replaceAll('import.meta.env.VITE_GEMINI_API_KEY', "''");
  m._compile(ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file);
  return m.exports;
}

const { buildImportedProfile, extractImportDates } = load('services/cvImportModel');
const { buildExtractedDocument } = load('services/cvImportGeometry');
const { pdfPageLines } = load('services/cvImportLayout');

const baseTheme = {
  accentColor: '#2557a7',
  fontFamily: 'sans',
  fontSize: 'medium',
  lineSpacing: 'normal',
  layoutStyle: 'modern',
};

test('Education with graduation year between degree and university maps cleanly (inline /, inline |, and blank-line GPA)', () => {
  const inlineSlash = [
    'Ibrahim Alsharjabi',
    'Software Engineer',
    'EDUCATION',
    'Bachelor of Computer Science / 2027 / International University of Technology Twintech',
    '',
    'GPA: 3.8 / 4.0',
  ].join('\n');
  const p1 = buildImportedProfile({ text: inlineSlash, warnings: [] }, 'edu1.pdf', 'pdf', baseTheme);
  assert.equal(p1.education.data.length, 1);
  assert.equal(p1.education.data[0].degree, 'Bachelor of Computer Science');
  assert.equal(p1.education.data[0].institution, 'International University of Technology Twintech');
  assert.equal(p1.education.data[0].graduationDate, '2027');
  assert.equal(p1.education.data[0].gpa, '3.8 / 4.0');

  const inlinePipe = [
    'Ibrahim Alsharjabi',
    'EDUCATION',
    'B.Eng Software Engineering | 2026 | Cairo University',
  ].join('\n');
  const p2 = buildImportedProfile({ text: inlinePipe, warnings: [] }, 'edu2.pdf', 'pdf', baseTheme);
  assert.equal(p2.education.data.length, 1);
  assert.equal(p2.education.data[0].degree, 'B.Eng Software Engineering');
  assert.equal(p2.education.data[0].institution, 'Cairo University');
  assert.equal(p2.education.data[0].graduationDate, '2026');
});

test('Importer recognizes numbered/creative headings, broader roles, slash-in-role titles, and Arabic-Indic date digits', () => {
  const cv = [
    'Sara Mansour',
    'Data Scientist',
    '01. About',
    'Applied researcher focused on distributed forecasting models.',
    '02. Career History',
    'Full Stack / Data Scientist | Cloud Labs',
    '',
    '٢٠٢١ – ٢٠٢٥',
    '',
    '• Built automated evaluation pipelines.',
    '— Tech Stack —',
    'Python, SQL, PyTorch',
  ].join('\n');

  const p = buildImportedProfile({ text: cv, warnings: [] }, 'sara.pdf', 'pdf', baseTheme);
  assert.equal(p.headline.data, 'Data Scientist');
  assert.ok(p.summary.data.includes('distributed forecasting'));
  assert.equal(p.experience.data.length, 1);
  assert.equal(p.experience.data[0].roleTitle, 'Full Stack / Data Scientist');
  assert.equal(p.experience.data[0].companyName, 'Cloud Labs');
  assert.equal(p.experience.data[0].startDate, '2021');
  assert.equal(p.experience.data[0].endDate, '2025');
  assert.equal(p.skills.data.length, 3);

  assert.deepEqual(extractImportDates('٢٠٢٠ - ٢٠٢٤'), { rest: '', start: '2020', end: '2024' });
});

test('buildExtractedDocument and pdfPageLines order Arabic RTL PDF spans right-to-left with proper spacing', () => {
  const items = [
    { str: 'برمجيات', transform: [12, 0, 0, 12, 100, 700], width: 45, height: 12, fontName: 'F1', fontRef: 'F1' },
    { str: 'مهندس', transform: [12, 0, 0, 12, 160, 700], width: 40, height: 12, fontName: 'F1', fontRef: 'F1' },
  ];
  const doc = buildExtractedDocument({ pages: [{ pageNumber: 1, width: 595, height: 842, items }] });
  assert.equal(doc.lines.length, 1);
  assert.equal(doc.lines[0].text, 'مهندس برمجيات');

  const page = pdfPageLines(items, 595, 842, 1);
  assert.equal(page.text, 'مهندس برمجيات');
});
