// Only governs the already-disclosed 503 model fallback; never adds attempts.
const MAX_WAIT_MS = 10000;
export function fallbackDelayMs(retryAfter: string | null, attemptIndex: number, now = Date.now(), random = Math.random(), bodyHintMs = 0): number | null {
  let hint = 0;
  if (retryAfter !== null) {
    const value = retryAfter.trim();
    if (/^\d+$/.test(value)) hint = Number(value) * 1000;
    // Accept HTTP-date, not arbitrary date-like provider text.
    else if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) hint = Math.max(0, parsed - now);
    }
  }
  hint = Math.max(hint, bodyHintMs);
  if (!Number.isFinite(hint) || hint > MAX_WAIT_MS) return null; // Never retry earlier than an exposed long hint.
  return Math.max(hint, Math.min(MAX_WAIT_MS, 1000 * 2 ** Math.min(Math.max(attemptIndex, 0), 3) + Math.floor(Math.max(0, Math.min(random, 0.999999)) * 250)));
}
export function waitForFallback(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Aborted', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
