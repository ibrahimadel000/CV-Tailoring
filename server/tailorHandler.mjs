// Platform-agnostic Web Standard handler for POST /api/tailor.
// Works on Node 18+, Cloudflare Pages/Workers, and Vercel without extra dependencies.

export const ALLOWED_MODELS = new Set([
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
]);

const MAX_BODY_BYTES = 220 * 1024;
const MAX_WIRE_CHARS = 180_000;
const UPSTREAM_TIMEOUT_MS = 85_000;

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

const defaultRateLimiter = createRateLimiter();

function jsonResponse(payload, status, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function clientIp(request) {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'local';
}

export async function handleTailorRequest(request, options = {}) {
  const {
    apiKey = '',
    accessToken = '',
    fetchImpl = fetch,
    rateLimiter = defaultRateLimiter,
    timeoutMs = UPSTREAM_TIMEOUT_MS,
  } = options;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: { code: 405, status: 'INVALID_ARGUMENT', message: 'Method not allowed.' } }, 405, { Allow: 'POST, OPTIONS' });
  }

  const trimmedKey = String(apiKey || '').trim();
  if (!trimmedKey || /REPLACE|MISSING|YOUR[_ -]|PLACEHOLDER/i.test(trimmedKey)) {
    return jsonResponse({ error: { code: 503, status: 'FAILED_PRECONDITION', message: 'Server GEMINI_API_KEY is not configured.' } }, 503);
  }

  const expectedToken = String(accessToken || '').trim();
  if (expectedToken) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${expectedToken}`) {
      return jsonResponse({ error: { code: 401, status: 'UNAUTHENTICATED', message: 'Unauthorized.' } }, 401);
    }
  }

  const rate = rateLimiter(clientIp(request));
  if (!rate.allowed) {
    return jsonResponse(
      { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Rate limit exceeded. Try again shortly.' } },
      429,
      { 'Retry-After': String(rate.retryAfterSec) },
    );
  }

  const declaredLen = request.headers.get('content-length');
  if (declaredLen && /^\d+$/.test(declaredLen) && Number(declaredLen) > MAX_BODY_BYTES) {
    return jsonResponse({ error: { code: 413, status: 'INVALID_ARGUMENT', message: 'Request payload too large.' } }, 413);
  }

  let rawText;
  try {
    rawText = await request.text();
  } catch {
    return jsonResponse({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Could not read request body.' } }, 400);
  }

  if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: { code: 413, status: 'INVALID_ARGUMENT', message: 'Request payload too large.' } }, 413);
  }

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch {
    return jsonResponse({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid JSON body.' } }, 400);
  }

  const model = typeof payload?.model === 'string' ? payload.model.trim() : '';
  const systemInstruction = typeof payload?.systemInstruction === 'string' ? payload.systemInstruction : '';
  const wire = typeof payload?.wire === 'string' ? payload.wire : '';
  const generationConfig = payload?.generationConfig && typeof payload.generationConfig === 'object' ? payload.generationConfig : null;

  if (!ALLOWED_MODELS.has(model)) {
    return jsonResponse({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Unsupported model.' } }, 400);
  }
  if (!systemInstruction || !wire || wire.length > MAX_WIRE_CHARS || !generationConfig) {
    return jsonResponse({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid tailoring request fields.' } }, 400);
  }

  const upstreamController = new AbortController();
  const onClientAbort = () => upstreamController.abort();
  if (request.signal) {
    if (request.signal.aborted) {
      return jsonResponse({ error: { code: 499, status: 'CANCELLED', message: 'Client cancelled.' } }, 499);
    }
    request.signal.addEventListener('abort', onClientAbort, { once: true });
  }
  const timer = setTimeout(() => upstreamController.abort(), timeoutMs);

  try {
    const upstream = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': trimmedKey,
        },
        signal: upstreamController.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: wire }] }],
          generationConfig,
        }),
      },
    );

    const responseText = await upstream.text();
    const headers = {
      'Content-Type': upstream.headers?.get?.('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    };
    const retryAfter = upstream.headers?.get?.('retry-after');
    if (retryAfter) headers['Retry-After'] = retryAfter;
    return new Response(responseText, { status: upstream.status, headers });
  } catch {
    if (request.signal?.aborted) {
      return jsonResponse({ error: { code: 499, status: 'CANCELLED', message: 'Client cancelled.' } }, 499);
    }
    return jsonResponse({ error: { code: 504, status: 'DEADLINE_EXCEEDED', message: 'Upstream provider request timed out or failed.' } }, 504);
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', onClientAbort);
  }
}
