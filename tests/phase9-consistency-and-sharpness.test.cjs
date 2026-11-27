const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { pathToFileURL } = require('node:url');
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

const { singleDraftInstructions, prepareSingleDraftRequest } = load('services/resumeComposer/singleDraftRequest');
const { prepareNaturalComposition } = load('services/resumeComposer/naturalDocument');
const { fixture } = require('./helpers/composer-editorial-v4-fixture.cjs');

function makeProfile(skillsLocked = false) {
  const p = fixture();
  p.summary.data = 'Software engineer building web applications and backend systems.';
  p.skills.isLocked = skillsLocked;
  p.skills.data = [
    { id: '00000000-0000-4000-8000-000000000001', name: 'PHP (Laravel, Custom MVC)', category: 'Languages' },
    { id: '00000000-0000-4000-8000-000000000002', name: 'C#', category: 'Languages' },
    { id: '00000000-0000-4000-8000-000000000003', name: 'C++', category: 'Languages' },
    { id: '00000000-0000-4000-8000-000000000004', name: 'RESTful APIs', category: 'Technical' },
    { id: '00000000-0000-4000-8000-000000000005', name: 'Photoshop', category: 'Tools' },
  ];
  return p;
}

test('singleDraftInstructions stays under 8000 chars and enforces anti-filler, anti-repetition, and jobMatchedSkillIds', () => {
  assert.ok(singleDraftInstructions.length < 8000);
  assert.ok(singleDraftInstructions.includes('guide.jobMatchedSkillIds'));
  assert.ok(singleDraftInstructions.includes('Proactive'));
  assert.ok(singleDraftInstructions.includes('Seamless'));
  assert.ok(singleDraftInstructions.includes('Do not repeat the same closing phrase'));
});

test('prepareSingleDraftRequest populates jobMatchedSkillIds for symbolic/parenthetical skills and skips negated or locked skills', () => {
  const job = [
    'Backend Software Engineer — build scalable web applications and backend services.',
    '- Develop RESTful API services using Laravel, C#, and C++.',
    '- Photoshop is not required for this role.',
  ].join('\n');
  const packet = prepareNaturalComposition(makeProfile(false), job);
  const parsed = JSON.parse(prepareSingleDraftRequest(packet).wire);
  assert.deepEqual(parsed.guide.jobMatchedSkillIds, ['skill_1', 'skill_2', 'skill_3', 'skill_4']);

  const lockedPacket = prepareNaturalComposition(makeProfile(true), job);
  const locked = JSON.parse(prepareSingleDraftRequest(lockedPacket).wire);
  assert.deepEqual(locked.guide.jobMatchedSkillIds, []);
});

test('tailorHandler allowlists and clamps temperature to [0, 1] without breaking omitted temperature', async () => {
  const modUrl = pathToFileURL(path.resolve(root, 'server', 'tailorHandler.mjs')).href;
  const { handleTailorRequest, createRateLimiter, createCircuitBreaker } = await import(modUrl);

  let forwarded;
  const makeReq = (generationConfig) => new Request('http://localhost/api/tailor', {
    method: 'POST',
    body: JSON.stringify({
      model: 'gemini-3.5-flash-lite',
      systemInstruction: 'You are a resume editor.',
      wire: JSON.stringify({ job: 'Backend Engineer', source: {} }),
      generationConfig,
    }),
  });
  const okFetch = async (_url, init) => {
    forwarded = JSON.parse(init.body);
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP' }] }), { status: 200 });
  };

  const res1 = await handleTailorRequest(makeReq({ responseMimeType: 'application/json', maxOutputTokens: 8192, temperature: 0.2 }), {
    apiKey: 'server-key-123456', rateLimiter: createRateLimiter(), circuitBreaker: createCircuitBreaker(), fetchImpl: okFetch,
  });
  assert.equal(res1.status, 200);
  assert.equal(forwarded.generationConfig.temperature, 0.2);

  const res2 = await handleTailorRequest(makeReq({ responseMimeType: 'application/json', maxOutputTokens: 8192, temperature: 5.5 }), {
    apiKey: 'server-key-123456', rateLimiter: createRateLimiter(), circuitBreaker: createCircuitBreaker(), fetchImpl: okFetch,
  });
  assert.equal(res2.status, 200);
  assert.equal(forwarded.generationConfig.temperature, 1);

  const res3 = await handleTailorRequest(makeReq({ responseMimeType: 'application/json', maxOutputTokens: 8192 }), {
    apiKey: 'server-key-123456', rateLimiter: createRateLimiter(), circuitBreaker: createCircuitBreaker(), fetchImpl: okFetch,
  });
  assert.equal(res3.status, 200);
  assert.equal(forwarded.generationConfig.temperature, undefined);
});

test('jobMatchedSkillIds avoids qualifier/slash/short false positives and respects cross-line negation', () => {
  const p = fixture();
  p.skills.data = [
    { id: '00000000-0000-4000-8000-000000000011', name: 'Excel (Basic)', category: 'Tools' },
    { id: '00000000-0000-4000-8000-000000000012', name: 'CI/CD', category: 'Tools' },
    { id: '00000000-0000-4000-8000-000000000013', name: 'Go', category: 'Languages' },
    { id: '00000000-0000-4000-8000-000000000014', name: 'Photoshop', category: 'Tools' },
  ];
  const job = [
    'We need basic go-to-market planning and CD music archiving.',
    'Legacy assets were made in Photoshop.',
    'Photoshop is not required for this role.',
  ].join('\n');
  const parsed = JSON.parse(prepareSingleDraftRequest(prepareNaturalComposition(p, job)).wire);
  assert.deepEqual(parsed.guide.jobMatchedSkillIds, []);
});

test('tailorHandler clamps negative temperature to 0 and rejects non-numeric temperature values', async () => {
  const modUrl = pathToFileURL(path.resolve(root, 'server', 'tailorHandler.mjs')).href;
  const { handleTailorRequest, createRateLimiter, createCircuitBreaker } = await import(modUrl);
  let forwarded;
  const makeReq = (temperature) => new Request('http://localhost/api/tailor', {
    method: 'POST',
    body: JSON.stringify({
      model: 'gemini-3.5-flash-lite',
      systemInstruction: 'You are a resume editor.',
      wire: JSON.stringify({ job: 'Backend Engineer', source: {} }),
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192, temperature },
    }),
  });
  const okFetch = async (_url, init) => {
    forwarded = JSON.parse(init.body);
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP' }] }), { status: 200 });
  };

  await handleTailorRequest(makeReq(-0.5), { apiKey: 'server-key-123456', rateLimiter: createRateLimiter(), circuitBreaker: createCircuitBreaker(), fetchImpl: okFetch });
  assert.equal(forwarded.generationConfig.temperature, 0);

  for (const invalid of [true, false, [], '   ', '0.2']) {
    await handleTailorRequest(makeReq(invalid), { apiKey: 'server-key-123456', rateLimiter: createRateLimiter(), circuitBreaker: createCircuitBreaker(), fetchImpl: okFetch });
    assert.equal(forwarded.generationConfig.temperature, undefined);
  }
});
