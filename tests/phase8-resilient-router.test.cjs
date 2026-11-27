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
    model: 'gemini-3.5-flash-lite',
    systemInstruction: 'You are a resume editor.',
    wire: JSON.stringify({ job: 'Backend Software Engineer', source: {} }),
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'low' } },
    ...overrides,
  });
}

function okResponse() {
  return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('503 on gemini-3.5-flash-lite retries same model once and succeeds within 1 rate-limit slot', async () => {
  const { handleTailorRequest, createRateLimiter, createCircuitBreaker } = await loadHandler();
  const calledModels = [];
  let n = 0;
  const fakeFetch = async (url) => {
    const m = String(url).match(/\/models\/([^:]+):generateContent/);
    calledModels.push(m ? m[1] : 'unknown');
    n++;
    if (n === 1) return new Response(JSON.stringify({ error: { code: 503, message: 'Busy' } }), { status: 503 });
    return okResponse();
  };
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
  const res = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', body: validBody() }),
    { apiKey: 'server-key-123456', rateLimiter: limiter, circuitBreaker: createCircuitBreaker(), retryDelayMs: 0, fetchImpl: fakeFetch },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(calledModels, ['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite']);
  assert.equal(res.headers.get('x-tailor-resolved-model'), 'gemini-3.5-flash-lite');
  assert.equal(res.headers.get('x-tailor-attempts'), '2');
});

test('double 503 on gemini-3.5-flash-lite fails over to gemini-3.8-flash (skipping 3.6-flash)', async () => {
  const { handleTailorRequest, createRateLimiter, createCircuitBreaker } = await loadHandler();
  const calledModels = [];
  const fakeFetch = async (url) => {
    const m = String(url).match(/\/models\/([^:]+):generateContent/);
    const model = m ? m[1] : 'unknown';
    calledModels.push(model);
    if (model === 'gemini-3.5-flash-lite') {
      return new Response(JSON.stringify({ error: { code: 503, message: 'Unavailable' } }), { status: 503 });
    }
    return okResponse();
  };
  const res = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', body: validBody() }),
    { apiKey: 'server-key-123456', rateLimiter: createRateLimiter(), circuitBreaker: createCircuitBreaker(), retryDelayMs: 0, fetchImpl: fakeFetch },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(calledModels, ['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.8-flash']);
  assert.equal(res.headers.get('x-tailor-resolved-model'), 'gemini-3.8-flash');
  assert.equal(res.headers.get('x-tailor-attempts'), '3');
});

test('429 on gemini-3.5-flash-lite skips same-model retry and fails over immediately to gemini-3.8-flash', async () => {
  const { handleTailorRequest, createRateLimiter, createCircuitBreaker } = await loadHandler();
  const calledModels = [];
  const fakeFetch = async (url) => {
    const m = String(url).match(/\/models\/([^:]+):generateContent/);
    const model = m ? m[1] : 'unknown';
    calledModels.push(model);
    if (model === 'gemini-3.5-flash-lite') {
      return new Response(JSON.stringify({ error: { code: 429, message: 'Quota' } }), { status: 429, headers: { 'retry-after': '10' } });
    }
    return okResponse();
  };
  const res = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', body: validBody() }),
    { apiKey: 'server-key-123456', rateLimiter: createRateLimiter(), circuitBreaker: createCircuitBreaker(), retryDelayMs: 0, fetchImpl: fakeFetch },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(calledModels, ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
  assert.equal(res.headers.get('x-tailor-attempts'), '2');
});

test('non-transient 400 and 403 errors never retry', async () => {
  const { handleTailorRequest, createRateLimiter, createCircuitBreaker } = await loadHandler();
  for (const status of [400, 403]) {
    let calls = 0;
    const res = await handleTailorRequest(
      new Request('http://localhost/api/tailor', { method: 'POST', body: validBody() }),
      {
        apiKey: 'server-key-123456',
        rateLimiter: createRateLimiter(),
        circuitBreaker: createCircuitBreaker(),
        retryDelayMs: 0,
        fetchImpl: async () => { calls++; return new Response(JSON.stringify({ error: { code: status } }), { status }); },
      },
    );
    assert.equal(res.status, status);
    assert.equal(calls, 1);
  }
});

test('timeout on primary model fails over to fallback model within total budget', async () => {
  const { handleTailorRequest, createRateLimiter, createCircuitBreaker } = await loadHandler();
  const calledModels = [];
  const fakeFetch = async (url, init) => {
    const m = String(url).match(/\/models\/([^:]+):generateContent/);
    const model = m ? m[1] : 'unknown';
    calledModels.push(model);
    if (model === 'gemini-3.5-flash-lite') {
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    }
    return okResponse();
  };
  const res = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', body: validBody() }),
    {
      apiKey: 'server-key-123456',
      rateLimiter: createRateLimiter(),
      circuitBreaker: createCircuitBreaker(),
      timeoutMs: 30,
      totalBudgetMs: 2000,
      retryDelayMs: 0,
      fetchImpl: fakeFetch,
    },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(calledModels, ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
});

test('circuit breaker deprioritizes repeatedly failing model until cooldown expires', async () => {
  const { handleTailorRequest, createRateLimiter, createCircuitBreaker } = await loadHandler();
  let fakeNow = 10_000;
  const breaker = createCircuitBreaker({ threshold: 2, cooldownMs: 30_000 });
  breaker.recordFailure('gemini-3.5-flash-lite', fakeNow);
  breaker.recordFailure('gemini-3.5-flash-lite', fakeNow);

  const calledWhileOpen = [];
  const res1 = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', body: validBody() }),
    {
      apiKey: 'server-key-123456',
      rateLimiter: createRateLimiter(),
      circuitBreaker: breaker,
      nowImpl: () => fakeNow,
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const m = String(url).match(/\/models\/([^:]+):generateContent/);
        calledWhileOpen.push(m ? m[1] : 'unknown');
        return okResponse();
      },
    },
  );
  assert.equal(res1.status, 200);
  assert.deepEqual(calledWhileOpen, ['gemini-3.8-flash']);

  // After cooldown expires, gemini-3.5-flash-lite is tried first again.
  fakeNow += 31_000;
  const calledAfterCooldown = [];
  const res2 = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', body: validBody() }),
    {
      apiKey: 'server-key-123456',
      rateLimiter: createRateLimiter(),
      circuitBreaker: breaker,
      nowImpl: () => fakeNow,
      retryDelayMs: 0,
      fetchImpl: async (url) => {
        const m = String(url).match(/\/models\/([^:]+):generateContent/);
        calledAfterCooldown.push(m ? m[1] : 'unknown');
        return okResponse();
      },
    },
  );
  assert.equal(res2.status, 200);
  assert.deepEqual(calledAfterCooldown, ['gemini-3.5-flash-lite']);
});

test('client abort cancels immediately with 499 and makes zero upstream calls', async () => {
  const { handleTailorRequest, createRateLimiter, createCircuitBreaker } = await loadHandler();
  const ac = new AbortController();
  ac.abort();
  let calls = 0;
  const res = await handleTailorRequest(
    new Request('http://localhost/api/tailor', { method: 'POST', body: validBody(), signal: ac.signal }),
    {
      apiKey: 'server-key-123456',
      rateLimiter: createRateLimiter(),
      circuitBreaker: createCircuitBreaker(),
      fetchImpl: async () => { calls++; return okResponse(); },
    },
  );
  assert.equal(res.status, 499);
  assert.equal(calls, 0);
});
