export const TAILOR_MODEL = 'gemini-2.5-flash';
export type TokenUsage = { input?: number; output?: number; thoughts?: number; cached?: number; total?: number };
export type TailorUsageRecord = TokenUsage & {
  id: string; at: string; model: string; elapsedMs: number; attempts: number;
  status: 'success' | 'failed' | 'cancelled' | 'reused'; reason?: string;
};
const USAGE_KEY = 'cv-tailor-usage-v1';
const DEVELOPMENT_KEY = import.meta.env.DEV ? (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim() : '';
declare const __TAILOR_API_URL__: string | undefined;
const PROXY_ENDPOINT = (typeof __TAILOR_API_URL__ === 'string' ? __TAILOR_API_URL__ : '').trim();

export function saveTailorUsage(record: TailorUsageRecord) {
  // Metrics only: no resume, job text, prompts, API key or raw provider error.
  try {
    let previous: unknown = [];
    try { previous = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '[]'); } catch { /* recover corrupted diagnostics */ }
    const entries = Array.isArray(previous) ? previous : [];
    localStorage.setItem(USAGE_KEY, JSON.stringify([...entries.slice(-59), record]));
  } catch { /* Diagnostics must never fail the resume operation. */ }
}

export function readLatestTailorUsage(): TailorUsageRecord | null {
  try {
    const entries = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '[]');
    const item = Array.isArray(entries) ? entries[entries.length - 1] : null;
    if (!item || !['success', 'failed', 'cancelled', 'reused'].includes(item.status)
      || !Number.isFinite(item.elapsedMs) || item.elapsedMs < 0 || !Number.isSafeInteger(item.attempts) || item.attempts < 0) return null;
    const count = (key: string) => Number.isSafeInteger(item[key]) && item[key] >= 0 ? item[key] as number : undefined;
    return { id: typeof item.id === 'string' ? item.id : '', at: typeof item.at === 'string' ? item.at : '',
      model: typeof item.model === 'string' ? item.model : '', status: item.status, attempts: item.attempts, elapsedMs: item.elapsedMs,
      input: count('input'), output: count('output'), thoughts: count('thoughts'), cached: count('cached'), total: count('total') };
  } catch { return null; }
}

export function getTailorConnection() {
  const endpoint = PROXY_ENDPOINT;
  if (endpoint) {
    return { ready: true, development: import.meta.env.DEV, model: TAILOR_MODEL, endpoint };
  }
  const value = DEVELOPMENT_KEY;
  const usable = value.length > 15 && !/REPLACE|MISSING|YOUR[_ -]|PLACEHOLDER|^test$/i.test(value);
  return { ready: usable, development: import.meta.env.DEV, model: TAILOR_MODEL, endpoint: '' };
}
