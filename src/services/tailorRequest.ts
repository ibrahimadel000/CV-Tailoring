import { TailorError, prepareTailorInput } from './tailorModel';
import { buildDraftInput, draftOutputSchema, decodeDraft } from '@/services/composer/draft';
import { draftSystem as systemInstruction } from '@/services/composer/draftPrompt';
import { BoundedResponseError, readBoundedJsonResponse } from './resumeComposer/boundedResponse';

export const TAILOR_MODEL = 'gemini-2.5-flash';
export const REQUEST_TIMEOUT_MS = 60000;
export type TokenUsage = { input?: number; output?: number; thoughts?: number; cached?: number; total?: number };
export type TailorUsageRecord = TokenUsage & {
  id: string; at: string; model: string; lastModel?: string; elapsedMs: number; attempts: number;
  status: 'success' | 'failed' | 'cancelled' | 'reused'; reason?: string;
};
const USAGE_KEY = 'cv-tailor-usage-v1';
const DEVELOPMENT_KEY = import.meta.env.DEV ? (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim() : '';
export function saveTailorUsage(record: TailorUsageRecord) {
  // Metrics only: no resume, job text, prompts, API key or raw provider error.
  try {
    let previous: unknown = [];
    try { previous = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '[]'); } catch { /* recover corrupted diagnostics */ }
    const entries = Array.isArray(previous) ? previous : [];
    localStorage.setItem(USAGE_KEY, JSON.stringify([...entries.slice(-59), record]));
  } catch { /* Diagnostics must never fail the resume operation. */ }
}
export function clearTailorUsage() {
  try { localStorage.removeItem(USAGE_KEY); } catch { /* Privacy cleanup must never block deletion. */ }
}
export function readLatestTailorUsage(): TailorUsageRecord | null {
  try {
    const entries = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '[]');
    const item = Array.isArray(entries) ? entries[entries.length - 1] : null;
    if (!item || !['success', 'failed', 'cancelled', 'reused'].includes(item.status)
      || !Number.isFinite(item.elapsedMs) || item.elapsedMs < 0 || !Number.isSafeInteger(item.attempts) || item.attempts < 0) return null;
    const count = (key: string) => Number.isSafeInteger(item[key]) && item[key] >= 0 ? item[key] as number : undefined;
    return { id: typeof item.id === 'string' ? item.id : '', at: typeof item.at === 'string' ? item.at : '',
      model: typeof item.model === 'string' ? item.model : '', lastModel: typeof item.lastModel === 'string' ? item.lastModel : undefined, status: item.status, attempts: item.attempts, elapsedMs: item.elapsedMs,
      input: count('input'), output: count('output'), thoughts: count('thoughts'), cached: count('cached'), total: count('total') };
  } catch { return null; }
}
export function getTailorConnection() {
  const value = DEVELOPMENT_KEY;
  const usable = value.length > 15 && !/REPLACE|MISSING|YOUR[_ -]|PLACEHOLDER|^test$/i.test(value);
  return { ready: usable, development: import.meta.env.DEV, model: TAILOR_MODEL };
}
function tokenUsage(raw: unknown): TokenUsage {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const count = (key: string) => typeof data[key] === 'number' && Number.isSafeInteger(data[key]) && (data[key] as number) >= 0 ? data[key] as number : undefined;
  return { input: count('promptTokenCount'), output: count('candidatesTokenCount'), thoughts: count('thoughtsTokenCount'), cached: count('cachedContentTokenCount'), total: count('totalTokenCount') };
}
export async function requestTailor(
  source: Parameters<typeof prepareTailorInput>[0],
  job: string,
  signal: AbortSignal,
  onUsage: (usage: TokenUsage) => void,
): Promise<ReturnType<typeof decodeDraft> & {jobPassages: ReturnType<typeof buildDraftInput>['inventory']['passages']}> {
  const {facts,inventory,wire}=buildDraftInput(source,job),jobs=inventory.passages;
  const outputSchema=draftOutputSchema(facts);
  if (!getTailorConnection().ready) throw new TailorError('configuration', import.meta.env.DEV
    ? 'Gemini is not configured yet. Your resumes are unchanged.'
    : 'AI tailoring needs a server connection before public deployment. Resume editing and export still work.');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal.aborted) throw new TailorError('cancelled', 'Tailoring cancelled. Your resumes are unchanged.');
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    // Local-development adapter only. VITE secrets are public in client code:
    // NEVER enable this path for a public production build. A backend adapter
    // must replace it before launch; no secret is requested/stored by this UI.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TAILOR_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': DEVELOPMENT_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(wire) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: outputSchema, temperature: 0.2, candidateCount: 1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 1024 } },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 429) throw new TailorError('quota', 'Gemini usage or rate limit reached. Wait before trying again. No automatic retry was made.');
      if (response.status === 401 || response.status === 403) throw new TailorError('authentication', 'Gemini rejected the credentials or access. Check the local API setup; your resumes are unchanged.');
      if (response.status === 404) throw new TailorError('model', 'The configured model is unavailable for this API account. No automatic retry was made.');
      if (response.status === 400) throw new TailorError('request', 'Gemini rejected the request settings. Keep this error category for debugging; your resumes are unchanged.');
      throw new TailorError('provider', 'Gemini is temporarily unavailable. Your resumes are unchanged; no automatic retry was made.');
    }
    let body: any;
    try { body = await readBoundedJsonResponse(response, controller.signal); }
    catch (error) {
      if (error instanceof BoundedResponseError) {
        throw new TailorError('invalid', error.kind === 'oversized'
          ? 'The AI response exceeded the safe result size. No resume was changed.'
          : 'Gemini returned an invalid response body. No resume was changed.');
      }
      throw error;
    }
    onUsage(tokenUsage(body?.usageMetadata));
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!body || typeof body !== 'object' || !Array.isArray(body.candidates) || body.candidates.length !== 1
      || !body.candidates[0] || typeof body.candidates[0] !== 'object') {
      throw new TailorError('invalid', 'Gemini returned an invalid response envelope. No resume was changed.');
    }
    const candidate = body.candidates[0];
    if (typeof candidate.finishReason !== 'string') throw new TailorError('invalid', 'Gemini returned an invalid response candidate. No resume was changed.');
    if (candidate.finishReason === 'MAX_TOKENS') throw new TailorError('truncated', 'The AI response reached its output limit. No partial changes were applied.');
    if (candidate?.finishReason !== 'STOP') throw new TailorError('blocked', 'Gemini did not return a completed result. No resume was changed.');
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) throw new TailorError('invalid', 'Gemini returned no readable result. No resume was changed.');
    const text = parts.filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string').map((p: { text: string }) => p.text).join('');
    if (text.length > 80000) throw new TailorError('invalid', 'The AI response exceeded the safe result size.');
    let raw:unknown;
    try { raw = JSON.parse(text); }
    catch { throw new TailorError('invalid', 'Gemini returned invalid JSON. No resume was changed.'); }
    const decoded = decodeDraft(raw,facts,jobs,source);
    decoded.warnings.push(...inventory.warnings);
    return {...decoded, jobPassages: jobs};
  } catch (error) {
    if (timedOut) throw new TailorError('timeout', 'Gemini took too long. No resume was changed. Cancelling the browser request may not stop provider-side processing.');
    if (signal.aborted) throw new TailorError('cancelled', 'Tailoring cancelled. Your resumes are unchanged. Provider processing may already have started.');
    if (error instanceof TailorError) throw error;
    throw new TailorError('network', 'The AI request could not be completed. Check the connection; no automatic retry was made.');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}