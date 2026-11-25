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
const UPSTREAM_TIMEOUT_MS = 42_000;

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

const defaultRateLimiter = createRateLimiter();

function corsHeaders(allowedOrigin) {
  if (!allowedOrigin) return {};
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

export async function handleTailorRequest(request, options = {}) {
  const {
    apiKey = '',
    accessToken = '',
    allowedOrigin = '',
    clientIp: explicitClientIp,
    fetchImpl = fetch,
    rateLimiter = defaultRateLimiter,
    timeoutMs = UPSTREAM_TIMEOUT_MS,
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
  const sanitizedConfig = {
    responseMimeType: 'application/json',
    maxOutputTokens,
    ...(generationConfig.responseSchema && typeof generationConfig.responseSchema === 'object' && !Array.isArray(generationConfig.responseSchema)
      ? { responseSchema: generationConfig.responseSchema }
      : {}),
    ...(generationConfig.thinkingConfig &&
    typeof generationConfig.thinkingConfig === 'object' &&
    ['low', 'medium'].includes(generationConfig.thinkingConfig.thinkingLevel)
      ? { thinkingConfig: { thinkingLevel: generationConfig.thinkingConfig.thinkingLevel } }
      : {}),
  };

  const upstreamController = new AbortController();
  let timedOut = false;
  const onClientAbort = () => upstreamController.abort();
  if (request.signal) {
    if (request.signal.aborted) {
      return jsonResponse({ error: { code: 499, status: 'CANCELLED', message: 'Client cancelled.' } }, 499, cors);
    }
    request.signal.addEventListener('abort', onClientAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    upstreamController.abort();
  }, timeoutMs);

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
          generationConfig: sanitizedConfig,
        }),
      },
    );

    const responseText = await readBoundedText(upstream, MAX_UPSTREAM_BYTES);
    const headers = {
      'Content-Type': upstream.headers?.get?.('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors,
    };
    const retryAfter = upstream.headers?.get?.('retry-after');
    if (retryAfter) headers['Retry-After'] = retryAfter;
    return new Response(responseText, { status: upstream.status, headers });
  } catch (err) {
    if (request.signal?.aborted) {
      return jsonResponse({ error: { code: 499, status: 'CANCELLED', message: 'Client cancelled.' } }, 499, cors);
    }
    if (err?.message === 'UPSTREAM_OVERSIZED') {
      return jsonResponse({ error: { code: 502, status: 'INTERNAL', message: 'Upstream response exceeded size limit.' } }, 502, cors);
    }
    if (timedOut) {
      return jsonResponse({ error: { code: 504, status: 'DEADLINE_EXCEEDED', message: 'Upstream provider request timed out.' } }, 504, cors);
    }
    return jsonResponse({ error: { code: 502, status: 'UNAVAILABLE', message: 'Upstream provider request failed.' } }, 502, cors);
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', onClientAbort);
  }
}
