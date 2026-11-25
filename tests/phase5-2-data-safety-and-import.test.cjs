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

const { serializeBackupJson, parseBackupJson } = load('services/profileBackup');
const { buildImportedProfile } = load('services/cvImportModel');
const { createSampleProfile } = load('mock/profile');

const baseTheme = {
  accentColor: '#2557a7',
  fontFamily: 'sans',
  fontSize: 'medium',
  lineSpacing: 'normal',
  layoutStyle: 'modern',
};

test('JSON backup round-trips profiles, remints colliding profileIds, and skips corrupted entries', () => {
  const p1 = createSampleProfile('Primary CV');
  const p2 = createSampleProfile('Backend CV');
  const raw = serializeBackupJson([p1, p2]);
  const parsed = JSON.parse(raw);
  parsed.profiles.push({ broken: true });

  const result = parseBackupJson(JSON.stringify(parsed), [p1.profileId]);
  assert.equal(result.profiles.length, 2);
  assert.equal(result.skippedCount, 1);
  assert.notEqual(result.profiles[0].profileId, p1.profileId);
  assert.equal(result.profiles[1].profileId, p2.profileId);
});

test('buildImportedProfile populates firstName/lastName, splits skill levels & categories, and splits inline cert dates', () => {
  const text = [
    'Ibrahim Adel',
    'Senior Software Engineer',
    'ibrahim@example.com · https://ibrahim.dev · github.com/ibrahim',
    'Skills',
    'Technical: TypeScript — Expert · Node.js',
    'Interpersonal: Technical Leadership · Communication',
    'Languages: Arabic — Native · English — Fluent',
    'Certifications',
    'AWS Solutions Architect — Amazon | 2025',
    'Google Cloud Associate — Google | 2024',
  ].join('\n');

  const imported = buildImportedProfile({ text, warnings: [] }, 'Ibrahim_Adel_Resume.docx', 'docx', baseTheme);
  assert.equal(imported.profileName, 'Ibrahim Adel Resume');
  assert.equal(imported.resumeHeader.data.firstName, 'Ibrahim');
  assert.equal(imported.resumeHeader.data.lastName, 'Adel');
  assert.equal(imported.resumeHeader.data.portfolio, 'https://ibrahim.dev');

  const tsSkill = imported.skills.data.find(s => s.name === 'TypeScript');
  assert.equal(tsSkill?.level, 'Expert');
  assert.equal(tsSkill?.category, 'Technical');

  const softSkill = imported.skills.data.find(s => s.name === 'Technical Leadership');
  assert.equal(softSkill?.category, 'Soft');

  const langSkill = imported.skills.data.find(s => s.name === 'Arabic');
  assert.equal(langSkill?.category, 'Languages');
  assert.equal(langSkill?.level, 'Native');

  assert.equal(imported.certifications.data.length, 2);
  assert.equal(imported.certifications.data[0].date, '2025');
  assert.equal(imported.certifications.data[1].date, '2024');
});
