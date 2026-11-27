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

const { buildImportedProfile, assessImportQuality } = load('services/cvImportModel');

const BASE_THEME = {
  accentColor: '#2557a7',
  fontFamily: 'sans',
  fontSize: 'medium',
  lineSpacing: 'normal',
  pageMargins: 'normal',
  layoutStyle: 'modern',
};

test('buildImportedProfile structures Date+Company / Role,City Experience, Bachelor-in-description Education, and Skills & Experience heading', () => {
  const text = [
    'NADER AL-WAJIH',
    'naderalwajih@gmail.com · +967-777893508',
    '',
    'Profile',
    'IT specialist with 10 years of experience in cybersecurity and network systems.',
    '',
    'Experience',
    '2022 – Now | Azal university',
    "Web Developer, Sana'a",
    'I am responsible for creating, developing, and maintaining Azal websites.',
    '',
    '2023 – 2023 | SMEPS',
    "Cybersecurity Consultant, Sana'a",
    'Trained company leaders in cybersecurity for networks and software.',
    '',
    '2019 - 2021 | Al-Nada Center for General Services',
    "IT Manager, Sana'a",
    'Managed IT department operations and team plans.',
    '',
    'Education',
    '2017 - 2021 | Master of Computer Science',
    "Sana'a University, Sana'a",
    '',
    '2003 - 2007 | Computer Science',
    'Thamar University, Thamar',
    "Bachelor's degree in Computer Science at Faculty of Information Technology",
    '',
    'Skills & Experience',
    '• Experience in databases and SQL query language.',
    '• Ability to use ArcGIS or Tableau.',
  ].join('\n');

  const profile = buildImportedProfile({ text, warnings: [] }, 'Nader CV.docx', 'docx', BASE_THEME);

  // All 3 roles structured in experience.data (NOT raw custom text!)
  assert.equal(profile.experience.data.length, 3);
  assert.equal(profile.experience.data[0].roleTitle, 'Web Developer');
  assert.equal(profile.experience.data[0].city, "Sana'a");
  assert.equal(profile.experience.data[0].companyName, 'Azal university');
  assert.equal(profile.experience.data[0].startDate, '2022');
  assert.equal(profile.experience.data[0].endDate, 'Now');
  assert.match(profile.experience.data[0].description, /creating, developing/);

  assert.equal(profile.experience.data[1].roleTitle, 'Cybersecurity Consultant');
  assert.equal(profile.experience.data[1].companyName, 'SMEPS');
  assert.equal(profile.experience.data[2].roleTitle, 'IT Manager');
  assert.equal(profile.experience.data[2].companyName, 'Al-Nada Center for General Services');

  // Both degrees structured in education.data (NO duplicate EDUCATION custom section!)
  assert.equal(profile.education.data.length, 2);
  assert.equal(profile.education.data[1].institution, 'Thamar University, Thamar');
  assert.match(profile.education.data[1].degree, /Bachelor's degree in Computer Science/);
  assert.equal(
    (profile.customSections ?? []).some(c => c.title.toLowerCase() === 'education'),
    false,
    'Must not spawn duplicate EDUCATION custom section',
  );

  // Skills & Experience becomes its own clean custom section (not trapped inside Education!)
  const skillsExp = (profile.customSections ?? []).find(c => /skills & experience/i.test(c.title));
  assert.ok(skillsExp, 'Expected Skills & Experience as its own custom section');
  assert.equal(skillsExp.paragraphs.length, 2);
});

test('assessImportQuality triggers Tier-2 AI fallback for floating-textbox DOCX, unstructured Experience, duplicate built-in sections, and sentence skills', () => {
  const cleanText = [
    'Jane Doe',
    'jane@example.com',
    'Experience',
    'Software Engineer | Acme',
    '2022 - Present',
    '• Built APIs.',
    'Skills',
    'TypeScript, React',
  ].join('\n');
  const cleanProfile = buildImportedProfile({ text: cleanText, warnings: [] }, 'clean.docx', 'docx', BASE_THEME);
  assert.equal(assessImportQuality(cleanProfile, { text: cleanText, warnings: [] }).needsAiFallback, false);

  // 1. complexLayout (4+ floating textboxes) triggers AI fallback
  const qComplex = assessImportQuality(cleanProfile, { text: cleanText, warnings: [], complexLayout: true });
  assert.equal(qComplex.needsAiFallback, true);
  assert.equal(qComplex.reason, 'complex-floating-layout');

  // 2. Experience heading present in raw text but 0 structured experience entries triggers AI fallback
  const noExp = structuredClone(cleanProfile);
  noExp.experience.data = [];
  const qNoExp = assessImportQuality(noExp, { text: cleanText, warnings: [] });
  assert.equal(qNoExp.needsAiFallback, true);
  assert.equal(qNoExp.reason, 'experience-unstructured');

  // 3. Duplicate built-in section name in customSections triggers AI fallback
  const dupSec = structuredClone(cleanProfile);
  dupSec.customSections = [{ id: '99999999-9999-4999-8999-999999999901', title: 'EDUCATION', kind: 'text', paragraphs: ['Raw'] }];
  const qDup = assessImportQuality(dupSec, { text: cleanText, warnings: [] });
  assert.equal(qDup.needsAiFallback, true);
  assert.equal(qDup.reason, 'duplicate-builtin-section');

  // 4. Sentence-length fake skill (> 55 chars) triggers AI fallback
  const badSkill = structuredClone(cleanProfile);
  badSkill.skills.data.push({
    id: '99999999-9999-4999-8999-999999999902',
    name: 'Extensive practical knowledge of complex systems builds and hardware testing across departments',
    category: 'Technical',
  });
  const qSkill = assessImportQuality(badSkill, { text: cleanText, warnings: [] });
  assert.equal(qSkill.needsAiFallback, true);
  assert.equal(qSkill.reason, 'sentence-in-skills');
});

test('cvImportFiles isolates floating textboxes, collapses double pipes, and ImportedCVNotice surfaces complex-layout warning', () => {
  const filesSrc = fs.readFileSync(path.join(root, 'src/services/cvImportFiles.ts'), 'utf8');
  assert.match(filesSrc, /insideTextbox/);
  assert.match(filesSrc, /textboxCount >= 4/);
  assert.match(filesSrc, /complexLayout/);

  const noticeSrc = fs.readFileSync(path.join(root, 'src/components/builder/ImportedCVNotice.tsx'), 'utf8');
  assert.match(noticeSrc, /AI-structured import/);
  assert.match(noticeSrc, /Some sections need a quick review/);
});

test('audit regressions: prose employment/experience does not trigger fallback, prose is not promoted to companyName, department comma stays in roleTitle, and parenthesized skills are spared', () => {
  // 1. Entry-level CV mentioning "employment" and "Experienced" in summary without an Experience heading
  const entryText = [
    'Amira Salem',
    'amira@example.com',
    'Summary',
    'Experienced computer science graduate seeking full-time employment in data analytics.',
    'Education',
    '2020 - 2024 | BSc Computer Science | Cairo University',
    'Skills',
    'Python (NumPy, Pandas, Scikit-learn, PyTorch, TensorFlow), SQL',
  ].join('\n');
  const entryProfile = buildImportedProfile({ text: entryText, warnings: [] }, 'entry.docx', 'docx', BASE_THEME);
  const qEntry = assessImportQuality(entryProfile, { text: entryText, warnings: [] });
  assert.equal(qEntry.needsAiFallback, false, `Entry-level CV with prose employment & parenthesized skill should not trigger AI fallback (got ${qEntry.reason})`);

  // 2. Role with no company followed by prose lines must NOT promote prose sentence to companyName
  const noCompanyText = [
    'Omar Tariq',
    'omar@example.com',
    'Experience',
    '2022 - Present | Senior Engineer',
    'Built distributed APIs across multiple clusters.',
    'Led 5 engineers on reliability.',
  ].join('\n');
  const noCompProfile = buildImportedProfile({ text: noCompanyText, warnings: [] }, 'nocomp.docx', 'docx', BASE_THEME);
  assert.equal(noCompProfile.experience.data.some(e => /Built distributed APIs/.test(e.companyName)), false);

  // 3. "Manager, Product Operations" must keep department in roleTitle (not split into city)
  const deptText = [
    'Lina Farouk',
    'lina@example.com',
    'Experience',
    '2021 - Present | Acme Corp',
    'Manager, Product Operations',
    '• Coordinated quarterly launches.',
  ].join('\n');
  const deptProfile = buildImportedProfile({ text: deptText, warnings: [] }, 'dept.docx', 'docx', BASE_THEME);
  assert.equal(deptProfile.experience.data.length, 1);
  assert.equal(deptProfile.experience.data[0].roleTitle, 'Manager, Product Operations');
  assert.equal(deptProfile.experience.data[0].city || '', '');
});
