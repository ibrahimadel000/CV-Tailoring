// Inspect only bounded, short-lived 503 error bodies. Never expose provider text.
const MAX_BYTES = 32768;
const MAX_READ_MS = 1500;
type Inspection = { ok: true; retryMs: number; body: Uint8Array | null } | { ok: false };
export async function inspect503Retry(response: Response, signal: AbortSignal, timeoutMs = MAX_READ_MS): Promise<Inspection> {
  const declared = response.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_BYTES) {
    void response.body?.cancel().catch(() => {}); return { ok: false };
  }
  const reader = response.body?.getReader();
  if (!reader) return { ok: true, retryMs: 0, body: null };
  let timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined, finished = false;
  const stopped = new Promise<never>((_, reject) => {
    abort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => reject(new Error('retry inspection timed out')), timeoutMs);
    if (signal.aborted) abort();
  });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) { finished = true; break; }
      size += value.byteLength;
      if (size > MAX_BYTES) return { ok: false };
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (!size) return { ok: true, retryMs: 0, body: bytes };
    let parsed: any;
    try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
    catch {
      // A declared JSON body may contain an unreadable hint; do not guess.
      return /(?:application|text)\/(?:[^;]+\+)?json\b/i.test(response.headers.get('content-type') ?? '') ? { ok: false } : { ok: true, retryMs: 0, body: bytes };
    }
    const error = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.error : undefined;
    if (!error || typeof error !== 'object' || Array.isArray(error)) return { ok: true, retryMs: 0, body: bytes };
    if (error.code !== undefined && error.code !== 503) return { ok: false };
    if (error.details !== undefined && !Array.isArray(error.details)) return { ok: false };
    // If details are too numerous, a later hint cannot safely be ruled out.
    if (error.details?.length > 16) return { ok: false };
    let retryMs = 0;
    for (const detail of error.details ?? []) {
      if (!detail || typeof detail !== 'object' || detail['@type'] !== 'type.googleapis.com/google.rpc.RetryInfo') continue;
      const delay = detail.retryDelay;
      if (typeof delay !== 'string' || !/^\d{1,12}(?:\.\d{1,9})?s$/.test(delay)) return { ok: false };
      const ms = Number(delay.slice(0, -1)) * 1000;
      if (!Number.isFinite(ms)) return { ok: false };
      retryMs = Math.max(retryMs, Math.ceil(ms));
    }
    return { ok: true, retryMs, body: bytes };
  } catch { return { ok: false }; }
  finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
    if (!finished) void reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch { /* A pending read will settle after cancellation. */ }
  }
}
