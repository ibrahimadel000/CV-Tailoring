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

const { cvProfileSchema } = load('types/schema');
const { createSampleProfile } = load('mock/profile');
const { resumeBlocks, essentials } = load('components/builder/resumeModel');
const { buildResumeMarkdown } = load('services/markdownExport');
const { buildResumeDocxBytes } = load('services/docxExport');
const { analyzeAtsReadability } = load('services/atsPdfCheck');
const { autoOptimizeTheme } = load('services/autoLayout');

function buildSampleProfile() {
  const profile = createSampleProfile('Phase 20 CV');

  profile.experience.data.push({
    id: '11111111-1111-4111-8111-111111111101',
    companyName: 'Old Retail Co',
    roleTitle: 'Early Intern',
    city: 'Dallas, TX',
    startDate: '2019',
    endDate: '2018', // intentionally reversed date on hidden entry to test ATS filter
    description: '',
    bullets: [{ id: '11111111-1111-4111-8111-111111111102', text: 'Assisted with legacy inventory scripts.', isVerified: false }],
    hidden: true,
  });

  profile.education.data.push({
    id: '11111111-1111-4111-8111-111111111103',
    institution: 'Hidden Bootcamp',
    degree: 'Short Workshop',
    city: 'Remote',
    graduationDate: '2019',
    hidden: true,
  });

  profile.certifications.data.push({
    id: '11111111-1111-4111-8111-111111111104',
    name: 'Expired Cert',
    issuer: 'OldVendor',
    date: '2017',
    hidden: true,
  });

  profile.projects.data.push({
    id: '11111111-1111-4111-8111-111111111105',
    name: 'Secret Prototype',
    role: 'Author',
    url: 'not a valid url',
    bullets: [{ id: '11111111-1111-4111-8111-111111111106', text: 'Internal-only experiment.', isVerified: false }],
    hidden: true,
  });

  profile.customSections = [
    {
      id: '11111111-1111-4111-8111-111111111107',
      title: 'Publications',
      kind: 'experience',
      paragraphs: [],
      entries: [
        {
          id: '11111111-1111-4111-8111-111111111108',
          title: 'Fast PDF Pipelines',
          organization: 'Systems Conf',
          startDate: '2025',
          endDate: '',
          description: 'Published benchmark study.',
          hidden: false,
        },
        {
          id: '11111111-1111-4111-8111-111111111109',
          title: 'Draft Paper',
          organization: 'Unpublished',
          startDate: '2024',
          endDate: '',
          description: 'Should stay hidden.',
          hidden: true,
        },
      ],
      hidden: false,
    },
    {
      id: '11111111-1111-4111-8111-111111111110',
      title: 'Hidden Volunteer Section',
      kind: 'list',
      paragraphs: ['Mentored 20 students'],
      hidden: true,
    },
  ];

  return profile;
}

test('schema accepts optional hidden flags on sections and entries while preserving backwards compatibility', () => {
  const profile = buildSampleProfile();
  const parsed = cvProfileSchema.parse(profile);
  const hiddenExp = parsed.experience.data.find(e => e.id === '11111111-1111-4111-8111-111111111101');
  assert.equal(hiddenExp.hidden, true);
  assert.equal(parsed.customSections[1].hidden, true);

  // Backwards compatibility: omitting hidden still parses cleanly
  const legacy = structuredClone(profile);
  delete legacy.summary.hidden;
  delete legacy.experience.hidden;
  delete legacy.experience.data[0].hidden;
  delete legacy.customSections[0].hidden;
  const legacyParsed = cvProfileSchema.parse(legacy);
  assert.equal(legacyParsed.summary.hidden, undefined);
});

test('resumeBlocks() and Markdown export exclude hidden entries (checked by entryId) and hidden sections', () => {
  const profile = buildSampleProfile();
  const blocks = resumeBlocks(profile);

  // Hidden custom section excluded
  assert.equal(blocks.some(b => b.id === 'custom:11111111-1111-4111-8111-111111111110'), false);
  // Visible custom section kept, hidden custom entry excluded
  const pubBlock = blocks.find(b => b.id === 'custom:11111111-1111-4111-8111-111111111107');
  assert.ok(pubBlock);
  assert.equal(pubBlock.items.length, 1);
  assert.equal(pubBlock.items[0].entryId, '11111111-1111-4111-8111-111111111108');

  // Non-vacuous entryId checks: visible entries kept, hidden entries excluded
  const expBlock = blocks.find(b => b.id === 'experience');
  assert.ok(expBlock.items.some(e => e.entryId === profile.experience.data[0].id));
  assert.equal(expBlock.items.some(e => e.entryId === '11111111-1111-4111-8111-111111111101'), false);

  const eduBlock = blocks.find(b => b.id === 'education');
  assert.ok(eduBlock.items.some(e => e.entryId === profile.education.data[0].id));
  assert.equal(eduBlock.items.some(e => e.entryId === '11111111-1111-4111-8111-111111111103'), false);

  const projBlock = blocks.find(b => b.id === 'projects');
  assert.ok(projBlock.items.some(e => e.entryId === profile.projects.data[0].id));
  assert.equal(projBlock.items.some(e => e.entryId === '11111111-1111-4111-8111-111111111105'), false);

  const certBlock = blocks.find(b => b.id === 'certifications');
  assert.ok(certBlock.items.some(e => e.entryId === profile.certifications.data[0].id));
  assert.equal(certBlock.items.some(e => e.entryId === '11111111-1111-4111-8111-111111111104'), false);

  // Markdown export respects hidden flags
  const md = buildResumeMarkdown(profile);
  assert.match(md, /Fast PDF Pipelines/);
  assert.doesNotMatch(md, /Old Retail Co/);
  assert.doesNotMatch(md, /Hidden Bootcamp/);
  assert.doesNotMatch(md, /Expired Cert/);
  assert.doesNotMatch(md, /Secret Prototype/);
  assert.doesNotMatch(md, /Draft Paper/);
  assert.doesNotMatch(md, /Hidden Volunteer Section/);

  // Hiding all entries in a visible section omits the entire section block
  const allHiddenExp = structuredClone(profile);
  allHiddenExp.experience.data.forEach(e => { e.hidden = true; });
  assert.equal(resumeBlocks(allHiddenExp).some(b => b.id === 'experience'), false);
  assert.doesNotMatch(buildResumeMarkdown(allHiddenExp), /## Experience/);

  // Hiding entire built-in sections removes them completely
  const hiddenSectionsProfile = structuredClone(profile);
  hiddenSectionsProfile.skills.hidden = true;
  hiddenSectionsProfile.summary.hidden = true;
  const blocks2 = resumeBlocks(hiddenSectionsProfile);
  assert.equal(blocks2.some(b => b.id === 'skills'), false);
  assert.equal(blocks2.some(b => b.id === 'summary'), false);
});

test('DOCX export excludes hidden sections and hidden entries across all section types', () => {
  const profile = buildSampleProfile();
  profile.skills.hidden = true;

  const bytes = buildResumeDocxBytes(profile, {
    accentColor: '#2557a7',
    fontFamily: 'sans',
    fontSize: 'medium',
    lineSpacing: 'normal',
    layoutStyle: 'classic',
  });
  const xml = strFromU8(unzipSync(bytes)['word/document.xml']);

  assert.match(xml, /Fast PDF Pipelines/);

  // Hidden entries & sections must not leak into Word export
  assert.doesNotMatch(xml, /Old Retail Co/);
  assert.doesNotMatch(xml, /Hidden Bootcamp/);
  assert.doesNotMatch(xml, /Expired Cert/);
  assert.doesNotMatch(xml, /Secret Prototype/);
  assert.doesNotMatch(xml, /Draft Paper/);
  assert.doesNotMatch(xml, /Hidden Volunteer Section/);
  assert.doesNotMatch(xml, />Skills</);
});

test('essentials(), analyzeAtsReadability(), and autoOptimizeTheme() ignore hidden sections and entries', () => {
  const profile = buildSampleProfile();
  // Hidden project has an invalid URL and hidden experience has reversed dates — ATS check must NOT warn on them
  const ats = analyzeAtsReadability(profile, null);
  const linkCheck = ats.checks.find(c => c.id === 'links-valid');
  assert.notEqual(linkCheck?.severity, 'warning');
  const dateCheck = ats.checks.find(c => c.id === 'date-consistency');
  assert.doesNotMatch(dateCheck?.detail || '', /start date after its end date/);

  // Hiding skills marks Relevant skills incomplete in essentials() and warns in ATS core sections
  const noSkills = structuredClone(profile);
  noSkills.skills.hidden = true;
  const ess = essentials(noSkills);
  assert.equal(ess.find(x => x.label === 'Relevant skills')?.done, false);
  const atsNoSkills = analyzeAtsReadability(noSkills, null);
  const coreCheck = atsNoSkills.checks.find(c => c.id === 'standard-headings');
  assert.equal(coreCheck?.severity, 'warning');
  assert.match(coreCheck?.detail || '', /Skills/);

  // autoOptimizeTheme ignores hidden certifications when deciding compactCertifications
  const certProfile = createSampleProfile('Cert Count');
  certProfile.certifications.data = [
    { id: '11111111-1111-4111-8111-111111111201', name: 'Cert 1', issuer: 'A', date: '2024', hidden: false },
    { id: '11111111-1111-4111-8111-111111111202', name: 'Cert 2', issuer: 'B', date: '2024', hidden: true },
    { id: '11111111-1111-4111-8111-111111111203', name: 'Cert 3', issuer: 'C', date: '2024', hidden: true },
    { id: '11111111-1111-4111-8111-111111111204', name: 'Cert 4', issuer: 'D', date: '2024', hidden: true },
  ];
  const opt = autoOptimizeTheme(certProfile, {
    accentColor: '#2557a7',
    fontFamily: 'sans',
    fontSize: 'medium',
    lineSpacing: 'normal',
    layoutStyle: 'classic',
    compactCertifications: false,
  }, { allowFitOnePage: false });
  assert.equal(opt.theme.compactCertifications, false);
});

test('UI components wire visibility toggles, lock guard, bullet reordering, and Ctrl+0 / Ctrl+Wheel zoom', () => {
  const sectionWorkspace = fs.readFileSync(path.join(root, 'src/components/builder/SectionWorkspace.tsx'), 'utf8');
  assert.match(sectionWorkspace, /toggleSectionHidden/);
  assert.match(sectionWorkspace, /isSectionLocked/);
  assert.match(sectionWorkspace, /section-visibility-btn/);

  const customSectionEditor = fs.readFileSync(path.join(root, 'src/components/builder/CustomSectionEditor.tsx'), 'utf8');
  assert.match(customSectionEditor, /onToggleHidden/);

  const editorControls = fs.readFileSync(path.join(root, 'src/components/builder/EditorControls.tsx'), 'utf8');
  assert.match(editorControls, /onToggleHidden/);
  assert.match(editorControls, /entry-visibility-btn/);

  const sectionEditor = fs.readFileSync(path.join(root, 'src/components/builder/SectionEditor.tsx'), 'utf8');
  assert.match(sectionEditor, /bullet-move-btn/);
  assert.match(sectionEditor, /Move achievement .* up/);
  assert.match(sectionEditor, /Move achievement .* down/);

  const builderStudio = fs.readFileSync(path.join(root, 'src/components/builder/BuilderStudio.tsx'), 'utf8');
  assert.match(builderStudio, /handleWheelZoom/);
  assert.match(builderStudio, /hasProfileRef/);
  assert.match(builderStudio, /key === '0'/);

  const paginatedPreview = fs.readFileSync(path.join(root, 'src/components/builder/PaginatedPreview.tsx'), 'utf8');
  assert.match(paginatedPreview, /onWheelZoom/);
  assert.match(paginatedPreview, /addEventListener\('wheel'/);
  assert.match(paginatedPreview, /passive:\s*false/);
});
