const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadHandler() {
  const modUrl = pathToFileURL(path.resolve(__dirname, '..', 'server', 'tailorHandler.mjs')).href;
  return import(modUrl);
}

function validBody(overrides = {}) {
  return JSON.stringify({
    model: 'gemini-3.8-flash',
    systemInstruction: 'You are a resume editor.',
    wire: JSON.stringify({ job: 'Software Engineer', source: {} }),
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 },
    ...overrides,
  });
}

test('tailor proxy rejects non-POST methods with 405', async () => {
  const { handleTailorRequest } = await loadHandler();
  const res = await handleTailorRequest(new Request('http://localhost/api/tailor', { method: 'GET' }), { apiKey: 'test-server-key-123456' });
  assert.equal(res.status, 405);
});

test('tailor proxy returns 503 when server GEMINI_API_KEY is missing', async () => {
  const { handleTailorRequest } = await loadHandler();
  const res = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', body: validBody() }),
    { apiKey: '' },
  );
  assert.equal(res.status, 503);
});

test('tailor proxy enforces optional bearer access token', async () => {
  const { handleTailorRequest, createRateLimiter } = await loadHandler();
  const res = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', body: validBody() }),
    { apiKey: 'test-server-key-123456', accessToken: 'secret-token', rateLimiter: createRateLimiter() },
  );
  assert.equal(res.status, 401);
});

test('tailor proxy rejects unsupported models with 400 before upstream fetch', async () => {
  const { handleTailorRequest, createRateLimiter } = await loadHandler();
  let called = 0;
  const res = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', body: validBody({ model: 'gemini-1.0-fake' }) }),
    { apiKey: 'test-server-key-123456', rateLimiter: createRateLimiter(), fetchImpl: async () => { called++; throw Error('should not call'); } },
  );
  assert.equal(res.status, 400);
  assert.equal(called, 0);
});

test('tailor proxy enforces per-IP rate limiting with 429 and Retry-After', async () => {
  const { handleTailorRequest, createRateLimiter } = await loadHandler();
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
  const fakeFetch = async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP' }] }), { status: 200 });

  const first = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' }, body: validBody() }),
    { apiKey: 'test-server-key-123456', rateLimiter: limiter, fetchImpl: fakeFetch },
  );
  assert.equal(first.status, 200);

  const second = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' }, body: validBody() }),
    { apiKey: 'test-server-key-123456', rateLimiter: limiter, fetchImpl: fakeFetch },
  );
  assert.equal(second.status, 429);
  assert.ok(Number(second.headers.get('retry-after')) >= 1);
});

test('tailor proxy forwards valid request with server-side key and returns upstream JSON', async () => {
  const { handleTailorRequest, createRateLimiter } = await loadHandler();
  let capturedUrl = '';
  let capturedKey = '';
  const fakeFetch = async (url, init) => {
    capturedUrl = String(url);
    capturedKey = init.headers['x-goog-api-key'];
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const res = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', body: validBody() }),
    { apiKey: 'server-only-gemini-key-999', rateLimiter: createRateLimiter(), fetchImpl: fakeFetch },
  );
  assert.equal(res.status, 200);
  assert.ok(capturedUrl.endsWith('/gemini-3.8-flash:generateContent'));
  assert.equal(capturedKey, 'server-only-gemini-key-999');
  const body = await res.json();
  assert.equal(body.candidates[0].finishReason, 'STOP');
});
