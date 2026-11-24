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

const { readBoundedText, readBoundedJson, BoundedResponseError } = load('services/resumeComposer/boundedResponse');
const { providerFailureMessage } = load('services/resumeComposer/providerDiagnostics');
const { analyzeTerms, unsupportedNumbers } = load('services/resumeComposer/terms');
const { scopeRisk } = load('services/resumeComposer/scopeRisk');
const { createCompositionRunner } = load('services/resumeComposer/workflow');
const { resumeBlocks } = load('components/builder/resumeModel');
const { createSampleProfile } = load('mock/profile');

test('readBoundedJson aborts immediately on a stalled response stream', async () => {
  const controller = new AbortController();
  const stream = new ReadableStream({ start() {} });
  const response = new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } });
  const pending = readBoundedJson(response, controller.signal, 65536);
  controller.abort();
  await assert.rejects(pending, err => err instanceof BoundedResponseError && err.kind === 'aborted');
});

test('readBoundedText enforces maxBytes cap', async () => {
  const response = new Response('x'.repeat(200), { status: 200 });
  await assert.rejects(
    readBoundedText(response, undefined, 100),
    err => err instanceof BoundedResponseError && err.kind === 'oversized',
  );
});

test('providerFailureMessage aborts immediately when error body stalls', async () => {
  const controller = new AbortController();
  const stream = new ReadableStream({ start() {} });
  const response = new Response(stream, { status: 503 });
  const pending = providerFailureMessage(response, controller.signal);
  controller.abort();
  await assert.rejects(pending, err => err && err.name === 'AbortError');
});

test('analyzeTerms does not flag sentence-initial action verbs followed by capitalized tools', () => {
  const result = analyzeTerms(
    'Automated MySQL backups and documented workflows.',
    ['Maintained MySQL backups and built workflow documentation.'],
    [],
  );
  assert.equal(result.unsupported.length, 0);
});

test('unsupportedNumbers recognizes written-out English numbers in source support', () => {
  assert.deepEqual(
    unsupportedNumbers('Trained 5 new developers on onboarding workflows.', ['Trained five new developers on onboarding workflows.']),
    [],
  );
  assert.deepEqual(
    unsupportedNumbers('Improved delivery speed by 40%.', ['Improved delivery speed across the team.']),
    ['40'],
  );
});

test('scopeRisk allows operations management across teams while still flagging invented direct people management', () => {
  assert.deepEqual(
    scopeRisk(
      'Managed business operations across cross-functional teams.',
      ['Supported business operations with cross-functional teams.'],
    ),
    [],
  );
  const directMgmt = scopeRisk(
    'Managed a team of 5 engineers.',
    ['Collaborated with engineers on backend features.'],
  );
  assert.ok(directMgmt.some(r => r.includes('team leadership')));
});

test('createCompositionRunner blocks overlapping runs while a cancelled provider promise is still pending', async () => {
  let resolveProvider;
  const providerPromise = new Promise(resolve => { resolveProvider = resolve; });
  const profile = createSampleProfile('Overlap test');
  const repo = { readActive: () => profile, appendIfCurrent: () => true };
  const runner = createCompositionRunner(repo, () => providerPromise);
  const c1 = new AbortController();
  const run1 = runner.run('Product Operations Analyst role requiring workflow automation and documentation.', c1.signal);
  c1.abort();
  await assert.rejects(run1, /cancelled/i);

  const c2 = new AbortController();
  await assert.rejects(
    runner.run('Product Operations Analyst role requiring workflow automation and documentation.', c2.signal),
    /already running/i,
  );
  assert.equal(runner.isBusy(), true);

  resolveProvider({ summarySegments: [], entries: [], skillSelections: [] });
  await new Promise(r => setImmediate(r));
  assert.equal(runner.isBusy(), false);
});

test('resumeBlocks filters out Imported details staging sections', () => {
  const blocks = resumeBlocks({
    profileId: 'p1', profileName: 'Test', version: 1, lastConfirmed: '',
    resumeHeader: { id: 'h', title: 'Header', data: { name: 'Alex' }, isLocked: false },
    headline: { id: 'hl', title: 'Headline', data: '', isLocked: false },
    summary: { id: 's', title: 'Summary', data: 'Builder', isLocked: false },
    experience: { id: 'e', title: 'Experience', data: [], isLocked: false },
    education: { id: 'ed', title: 'Education', data: [], isLocked: false },
    skills: { id: 'sk', title: 'Skills', data: [], isLocked: false },
    projects: { id: 'pr', title: 'Projects', data: [], isLocked: false },
    certifications: { id: 'c', title: 'Certifications', data: [], isLocked: false },
    customSections: [
      { id: 'imp1', title: 'Imported details', kind: 'text', paragraphs: ['Unparsed line'] },
      { id: 'vol1', title: 'Volunteering', kind: 'text', paragraphs: ['Community mentor'] },
    ],
    sectionOrder: ['personal', 'summary', 'custom:imp1', 'custom:vol1'],
  });
  assert.equal(blocks.some(b => b.title.toLowerCase() === 'imported details'), false);
  assert.equal(blocks.some(b => b.title === 'Volunteering'), true);
});
