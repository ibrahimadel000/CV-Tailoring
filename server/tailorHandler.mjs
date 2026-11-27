// Platform-agnostic Web Standard handler for POST /api/tailor.
// Works on Node 18+, Cloudflare Pages/Workers, and Vercel without extra dependencies.

export const ALLOWED_MODELS = new Set([
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
]);

const MAX_BODY_BYTES = 220 * 1024;
const MAX_SYSTEM_INSTRUCTION_CHARS = 12_000;
const MAX_WIRE_CHARS = 180_000;
const MAX_UPSTREAM_BYTES = 512 * 1024;
const TOTAL_BUDGET_MS = 52_000;
const MODEL_TIMEOUT_MS = {
  'gemini-3.5-flash-lite': 26_000,
  'gemini-3.6-flash': 25_000,
  'gemini-3.8-flash': 28_000,
};
const FALLBACK_BY_MODEL = {
  'gemini-3.5-flash-lite': ['gemini-3.8-flash'],
  'gemini-3.6-flash': ['gemini-3.5-flash-lite', 'gemini-3.8-flash'],
  'gemini-3.8-flash': ['gemini-3.5-flash-lite'],
};
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_SAME_MODEL_STATUSES = new Set([500, 502, 503, 504]);

// Prompt-injection delimiting & invisible-char neutralization (adapted from Reactive Resume data-block.ts, MIT).
const HIDDEN_INJECTION_CHARS = /[\u00AD\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069\u{E0000}-\u{E007F}]/gu;

export function stripHiddenInjectionChars(value) {
  if (typeof value === 'string') return value.replace(HIDDEN_INJECTION_CHARS, '');
  if (Array.isArray(value)) return value.map(stripHiddenInjectionChars);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripHiddenInjectionChars(v);
    return out;
  }
  return value;
}

export function wrapUntrustedDataBlock(name, text) {
  const safeName = String(name || 'DATA').replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
  const safeText = String(text ?? '')
    .replace(HIDDEN_INJECTION_CHARS, '')
    .replace(/<<</g, '‹‹‹')
    .replace(/>>>/g, '›››');
  return `<<<${safeName}_START>>>\n${safeText}\n<<<${safeName}_END>>>`;
}

export function isConfiguredApiKey(apiKey) {
  const trimmed = String(apiKey || '').trim();
  return Boolean(trimmed) && !/REPLACE|MISSING|YOUR[_ -]|PLACEHOLDER/i.test(trimmed);
}

function timingSafeEqualString(a, b) {
  const enc = new TextEncoder();
  const ba = enc.encode(String(a));
  const bb = enc.encode(String(b));
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export function createRateLimiter({ max = 15, windowMs = 10 * 60 * 1000 } = {}) {
  const buckets = new Map();
  return function checkRateLimit(key, now = Date.now()) {
    const cutoff = now - windowMs;
    const recent = (buckets.get(key) || []).filter(ts => ts > cutoff);
    if (recent.length >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      buckets.set(key, recent);
      return { allowed: false, retryAfterSec, remaining: 0 };
    }
    recent.push(now);
    buckets.set(key, recent);
    // Keep memory bounded under high cardinality.
    if (buckets.size > 5000) {
      for (const [k, list] of buckets.entries()) {
        if (!list.length || list[list.length - 1] <= cutoff) buckets.delete(k);
      }
    }
    return { allowed: true, retryAfterSec: 0, remaining: Math.max(0, max - recent.length) };
  };
}

export function createCircuitBreaker({ threshold = 3, cooldownMs = 30_000 } = {}) {
  const state = new Map();
  return {
    isOpen(model, now = Date.now()) {
      const entry = state.get(model);
      if (!entry) return false;
      if (entry.openUntil > now) return true;
      if (entry.openUntil > 0) {
        state.delete(model);
      }
      return false;
    },
    recordSuccess(model) {
      state.delete(model);
    },
    recordFailure(model, now = Date.now()) {
      const prev = state.get(model) || { failures: 0, openUntil: 0 };
      const failures = prev.failures + 1;
      const openUntil = failures >= threshold ? now + cooldownMs : 0;
      state.set(model, { failures, openUntil });
    },
  };
}

const defaultRateLimiter = createRateLimiter();
const defaultCircuitBreaker = createCircuitBreaker();

function corsHeaders(allowedOrigin) {
  if (!allowedOrigin) return {};
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'X-Tailor-Resolved-Model, X-Tailor-Attempts, X-Tailor-Error-Source, Retry-After',
    'Vary': 'Origin',
  };
}

function jsonResponse(payload, status, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Tailor-Error-Source': 'proxy',
      ...extraHeaders,
    },
  });
}

function fallbackClientIp(request) {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'local';
}

function parseRetryAfterMs(value, now = Date.now()) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const ts = Date.parse(trimmed);
  if (Number.isFinite(ts)) {
    return Math.max(0, ts - now);
  }
  return null;
}

function abortableSleep(ms, signal, sleepImpl) {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  if (sleepImpl) {
    return sleepImpl(ms, signal);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function readBoundedText(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error('UPSTREAM_OVERSIZED');
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('UPSTREAM_OVERSIZED');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function buildModelOrder(requestedModel, circuitBreaker, now) {
  const candidates = [requestedModel, ...(FALLBACK_BY_MODEL[requestedModel] || [])];
  const healthy = [];
  const open = [];
  for (const m of candidates) {
    if (circuitBreaker.isOpen(m, now)) open.push(m);
    else healthy.push(m);
  }
  return [...healthy, ...open];
}

export async function handleTailorRequest(request, options = {}) {
  const {
    apiKey = '',
    accessToken = '',
    allowedOrigin = '',
    clientIp: explicitClientIp,
    fetchImpl = fetch,
    rateLimiter = defaultRateLimiter,
    circuitBreaker = defaultCircuitBreaker,
    timeoutMs,
    totalBudgetMs = TOTAL_BUDGET_MS,
    retryDelayMs = 800,
    sleepImpl,
    nowImpl = () => Date.now(),
  } = options;

  const cors = corsHeaders(allowedOrigin);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: { code: 405, status: 'INVALID_ARGUMENT', message: 'Method not allowed.' } }, 405, { Allow: 'POST, OPTIONS', ...cors });
  }

  const trimmedKey = String(apiKey || '').trim();
  if (!isConfiguredApiKey(trimmedKey)) {
    return jsonResponse({ error: { code: 503, status: 'FAILED_PRECONDITION', message: 'Server GEMINI_API_KEY is not configured.' } }, 503, cors);
  }

  const expectedToken = String(accessToken || '').trim();
  if (expectedToken) {
    const auth = request.headers.get('authorization') || '';
    if (!timingSafeEqualString(auth, `Bearer ${expectedToken}`)) {
      return jsonResponse({ error: { code: 401, status: 'UNAUTHENTICATED', message: 'Unauthorized.' } }, 401, cors);
    }
  }

  const ip = typeof explicitClientIp === 'string' && explicitClientIp.trim()
    ? explicitClientIp.trim()
    : fallbackClientIp(request);
  const rate = rateLimiter(ip);
  if (!rate.allowed) {
    return jsonResponse(
      { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Rate limit exceeded. Try again shortly.' } },
      429,
      { 'Retry-After': String(rate.retryAfterSec), ...cors },
    );
  }

  const declaredLen = request.headers.get('content-length');
  if (declaredLen && /^\d+$/.test(declaredLen) && Number(declaredLen) > MAX_BODY_BYTES) {
    return jsonResponse({ error: { code: 413, status: 'INVALID_ARGUMENT', message: 'Request payload too large.' } }, 413, cors);
  }

  let rawText;
  try {
    rawText = await request.text();
  } catch {
    return jsonResponse({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Could not read request body.' } }, 400, cors);
  }

  if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: { code: 413, status: 'INVALID_ARGUMENT', message: 'Request payload too large.' } }, 413, cors);
  }

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch {
    return jsonResponse({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid JSON body.' } }, 400, cors);
  }

  const model = typeof payload?.model === 'string' ? payload.model.trim() : '';
  const systemInstruction = typeof payload?.systemInstruction === 'string' ? payload.systemInstruction : '';
  const wire = typeof payload?.wire === 'string' ? payload.wire : '';
  const generationConfig = payload?.generationConfig && typeof payload.generationConfig === 'object' && !Array.isArray(payload.generationConfig)
    ? payload.generationConfig
    : null;

  if (!ALLOWED_MODELS.has(model)) {
    return jsonResponse({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Unsupported model.' } }, 400, cors);
  }
  if (
    !systemInstruction ||
    systemInstruction.length > MAX_SYSTEM_INSTRUCTION_CHARS ||
    !wire ||
    wire.length > MAX_WIRE_CHARS ||
    !generationConfig
  ) {
    return jsonResponse({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid tailoring request fields.' } }, 400, cors);
  }

  // Validate wire is a structured tailoring packet ({ job: string, source: object }).
  let parsedWire;
  try {
    parsedWire = JSON.parse(wire);
  } catch {
    return jsonResponse({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid tailoring wire JSON.' } }, 400, cors);
  }
  if (!parsedWire || typeof parsedWire !== 'object' || typeof parsedWire.job !== 'string' || !parsedWire.source || typeof parsedWire.source !== 'object') {
    return jsonResponse({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Tailoring wire must include job and source.' } }, 400, cors);
  }

  // Reconstruct generationConfig from an explicit allowlist to prevent general-purpose API relay abuse.
  if (generationConfig.responseMimeType !== 'application/json') {
    return jsonResponse({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid generationConfig.' } }, 400, cors);
  }
  const rawMaxTokens = Number(generationConfig.maxOutputTokens);
  const maxOutputTokens = Number.isFinite(rawMaxTokens) ? Math.min(Math.max(Math.trunc(rawMaxTokens), 256), 16384) : 8192;
  const hasValidTemp = typeof generationConfig.temperature === 'number' && Number.isFinite(generationConfig.temperature);
  const sanitizedConfig = {
    responseMimeType: 'application/json',
    maxOutputTokens,
    ...(hasValidTemp ? { temperature: Math.min(Math.max(generationConfig.temperature, 0), 1) } : {}),
    ...(generationConfig.responseSchema && typeof generationConfig.responseSchema === 'object' && !Array.isArray(generationConfig.responseSchema)
      ? { responseSchema: generationConfig.responseSchema }
      : {}),
    ...(generationConfig.thinkingConfig &&
    typeof generationConfig.thinkingConfig === 'object' &&
    ['low', 'medium'].includes(generationConfig.thinkingConfig.thinkingLevel)
      ? { thinkingConfig: { thinkingLevel: generationConfig.thinkingConfig.thinkingLevel } }
      : {}),
  };

  if (request.signal?.aborted) {
    return jsonResponse({ error: { code: 499, status: 'CANCELLED', message: 'Client cancelled.' } }, 499, cors);
  }

  const hardenedWire = JSON.stringify({
    ...parsedWire,
    source: stripHiddenInjectionChars(parsedWire.source),
    job: wrapUntrustedDataBlock('JOB_DESCRIPTION', parsedWire.job),
  });

  const upstreamBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: hardenedWire }] }],
    generationConfig: sanitizedConfig,
  });

  const startedAt = nowImpl();
  const modelOrder = buildModelOrder(model, circuitBreaker, startedAt);
  let attempts = 0;
  let lastHttpFailure = null;
  let lastErrorKind = null; // 'timeout' | 'network'
  let lastModel = modelOrder[0];

  outer: for (let mIdx = 0; mIdx < modelOrder.length; mIdx++) {
    const targetModel = modelOrder[mIdx];
    // Allow 1 fast same-model retry on the first healthy model for transient 5xx/network blips.
    const maxTriesForModel = mIdx === 0 && !circuitBreaker.isOpen(targetModel, startedAt) ? 2 : 1;

    for (let tryNum = 0; tryNum < maxTriesForModel; tryNum++) {
      if (request.signal?.aborted) {
        return jsonResponse({ error: { code: 499, status: 'CANCELLED', message: 'Client cancelled.' } }, 499, cors);
      }

      const remainingBudget = totalBudgetMs - (nowImpl() - startedAt);
      if (remainingBudget <= 500) {
        if (!lastHttpFailure && !lastErrorKind) lastErrorKind = 'timeout';
        break outer;
      }

      const defaultModelTimeout = MODEL_TIMEOUT_MS[targetModel] ?? 20_000;
      const attemptTimeout = Math.min(timeoutMs ?? defaultModelTimeout, remainingBudget);

      const upstreamController = new AbortController();
      let timedOut = false;
      const onClientAbort = () => upstreamController.abort();
      request.signal?.addEventListener('abort', onClientAbort, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        upstreamController.abort();
      }, attemptTimeout);

      attempts++;
      lastModel = targetModel;
      let sleepMs = 0;
      let moveToNextModel = false;

      try {
        const upstream = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`,
          {
            method: 'POST',
            redirect: 'error',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': trimmedKey,
            },
            signal: upstreamController.signal,
            body: upstreamBody,
          },
        );

        const responseText = await readBoundedText(upstream, MAX_UPSTREAM_BYTES);
        const retryAfter = upstream.headers?.get?.('retry-after') || '';
        const contentType = upstream.headers?.get?.('content-type') || 'application/json; charset=utf-8';

        if (upstream.ok) {
          circuitBreaker.recordSuccess(targetModel);
          const headers = {
            'Content-Type': contentType,
            'Cache-Control': 'no-store',
            'X-Tailor-Resolved-Model': targetModel,
            'X-Tailor-Attempts': String(attempts),
            ...cors,
          };
          if (retryAfter) headers['Retry-After'] = retryAfter;
          return new Response(responseText, { status: upstream.status, headers });
        }

        // Non-transient client/auth errors (400, 401, 403, 404, etc.) — never retry.
        if (!TRANSIENT_STATUSES.has(upstream.status)) {
          const headers = {
            'Content-Type': contentType,
            'Cache-Control': 'no-store',
            'X-Tailor-Resolved-Model': targetModel,
            'X-Tailor-Attempts': String(attempts),
            ...cors,
          };
          if (retryAfter) headers['Retry-After'] = retryAfter;
          return new Response(responseText, { status: upstream.status, headers });
        }

        const failureNow = nowImpl();
        circuitBreaker.recordFailure(targetModel, failureNow);
        lastHttpFailure = { status: upstream.status, text: responseText, contentType, retryAfter, model: targetModel };
        lastErrorKind = null;

        // On 429 (quota/rate limit), skip same-model retry and move straight to fallback model.
        if (!RETRY_SAME_MODEL_STATUSES.has(upstream.status)) {
          moveToNextModel = true;
        } else if (tryNum + 1 < maxTriesForModel) {
          const parsedRetryAfter = parseRetryAfterMs(retryAfter, failureNow);
          if (parsedRetryAfter !== null && parsedRetryAfter > 4_000) {
            moveToNextModel = true; // Retry-After too long; fail over to next model immediately.
          } else {
            const jitter = retryDelayMs > 0 ? Math.floor(Math.random() * 400) : 0;
            const delay = parsedRetryAfter !== null ? Math.min(parsedRetryAfter, 4_000) : retryDelayMs + jitter;
            const budgetAfterDelay = totalBudgetMs - (failureNow - startedAt) - delay;
            if (budgetAfterDelay <= 1_500) moveToNextModel = true;
            else sleepMs = delay;
          }
        }
      } catch (err) {
        if (request.signal?.aborted) {
          return jsonResponse({ error: { code: 499, status: 'CANCELLED', message: 'Client cancelled.' } }, 499, cors);
        }
        if (err?.message === 'UPSTREAM_OVERSIZED') {
          return jsonResponse({ error: { code: 502, status: 'INTERNAL', message: 'Upstream response exceeded size limit.' } }, 502, {
            'X-Tailor-Resolved-Model': targetModel,
            'X-Tailor-Attempts': String(attempts),
            ...cors,
          });
        }
        const failureNow = nowImpl();
        circuitBreaker.recordFailure(targetModel, failureNow);
        if (timedOut) {
          lastErrorKind = 'timeout';
          lastHttpFailure = null;
          // On a timeout, move straight to the next model instead of burning another timeout on the same model.
          moveToNextModel = true;
        } else {
          lastErrorKind = 'network';
          lastHttpFailure = null;
          if (tryNum + 1 < maxTriesForModel && retryDelayMs > 0) {
            const budgetAfterDelay = totalBudgetMs - (failureNow - startedAt) - retryDelayMs;
            if (budgetAfterDelay <= 1_500) moveToNextModel = true;
            else sleepMs = retryDelayMs;
          }
        }
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onClientAbort);
      }

      if (moveToNextModel) break;
      if (sleepMs > 0) {
        try {
          await abortableSleep(sleepMs, request.signal, sleepImpl);
        } catch {
          return jsonResponse({ error: { code: 499, status: 'CANCELLED', message: 'Client cancelled.' } }, 499, cors);
        }
      }
    }
  }

  const telemetryHeaders = {
    'X-Tailor-Resolved-Model': lastModel,
    'X-Tailor-Attempts': String(attempts),
    ...cors,
  };

  if (lastHttpFailure) {
    const headers = {
      'Content-Type': lastHttpFailure.contentType,
      'Cache-Control': 'no-store',
      ...telemetryHeaders,
    };
    if (lastHttpFailure.retryAfter) headers['Retry-After'] = lastHttpFailure.retryAfter;
    return new Response(lastHttpFailure.text, { status: lastHttpFailure.status, headers });
  }
  if (lastErrorKind === 'timeout') {
    return jsonResponse({ error: { code: 504, status: 'DEADLINE_EXCEEDED', message: 'Upstream provider request timed out.' } }, 504, telemetryHeaders);
  }
  return jsonResponse({ error: { code: 502, status: 'UNAVAILABLE', message: 'Upstream provider request failed.' } }, 502, telemetryHeaders);
}
