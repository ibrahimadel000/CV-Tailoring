import { BoundedResponseError, readBoundedJson } from './boundedResponse';
import { providerFailureMessage } from './providerDiagnostics';
import type { NaturalPacket } from './naturalDocument';
import { singleDraftInstructions, prepareSingleDraftRequest } from './singleDraftRequest';
import { TailorError } from '@/services/tailorModel';
import { getTailorConnection, saveTailorUsage, type TokenUsage } from '@/services/tailorConnection';

export const COMPOSITION_MODEL = 'gemini-3.5-flash-lite';
// Explicit, bounded development choices; active Gemini 3.x models only.
export const COMPOSITION_MODELS = [
  { id: COMPOSITION_MODEL, label: 'Gemini 3.5 Flash-Lite' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
] as const;
export type CompositionModel = typeof COMPOSITION_MODELS[number]['id'];
export const TAILORING_STYLES = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'concise', label: 'Concise (1-page friendly)' },
  { id: 'impact', label: 'Impact-focused' },
] as const;
export type TailoringStyle = typeof TAILORING_STYLES[number]['id'];
const STYLE_GUIDANCE: Record<Exclude<TailoringStyle, 'balanced'>, string> = {
  concise: 'STYLE PREFERENCE (Concise): Keep the summary to 2 tight sentences and trim redundant filler across bullets so every line stays short, scannable, and faithful to SOURCE.',
  impact: 'STYLE PREFERENCE (Impact-focused): Lead each rewritten bullet with the strongest verified action and stated outcome from SOURCE, keeping all metrics, limits, and attribution strictly factual.',
};
export const COMPOSITION_TIMEOUT_MS = 90000;
const MAX_RESPONSE_BYTES = 262144;
export const COMPOSITION_PREVIEW_LABEL = 'Single-draft preview · Gemini 3.5 Flash-Lite · experimental';
// Development adapter only. Public builds need a server; no client production key.
const key = import.meta.env.DEV ? (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim() : '';
// Live failover on transient 503/504 (at most 1 fallback to fast Flash-Lite; never deprecated models).
const LIVE_FALLBACKS: CompositionModel[] = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'];

function addUsage(prev: TokenUsage, next: TokenUsage): TokenUsage {
  const sum = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
  return {
    input: sum(prev.input, next.input),
    output: sum(prev.output, next.output),
    thoughts: sum(prev.thoughts, next.thoughts),
    total: sum(prev.total, next.total),
  };
}

export async function requestComposition(packet: NaturalPacket, signal: AbortSignal, model: CompositionModel = COMPOSITION_MODEL, style: TailoringStyle = 'balanced'): Promise<unknown> {
  if (!COMPOSITION_MODELS.some(option => option.id === model)) throw new TailorError('configuration', 'Unsupported model. Nothing was sent.');
  if (!TAILORING_STYLES.some(option => option.id === style)) throw new TailorError('configuration', 'Unsupported tailoring style. Nothing was sent.');
  if (signal.aborted) throw new TailorError('cancelled', 'Cancelled. Nothing was sent.');
  const connection = getTailorConnection();
  if (!connection.ready) throw new TailorError('configuration', 'AI is not connected. Configure VITE_TAILOR_API_URL=/api/tailor with a server-side GEMINI_API_KEY.');
  const proxyEndpoint = typeof (connection as { endpoint?: string }).endpoint === 'string' ? (connection as { endpoint?: string }).endpoint!.trim() : '';
  const { responseSchema: schema, wire } = prepareSingleDraftRequest(packet);
  if (wire.length > 180000) throw new TailorError('input', 'Source exceeds the request budget. Nothing was sent.');
  const controller = new AbortController(), started = performance.now();
  let timedOut = false, status: 'success' | 'failed' | 'cancelled' = 'failed', reason = '', usage: TokenUsage = {}, attempts = 0;
  let resolvedModel: CompositionModel = model;
  const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, COMPOSITION_TIMEOUT_MS);
  const isSynthetic = !proxyEndpoint && /^synthetic-/i.test(key);
  const fallback = !isSynthetic ? LIVE_FALLBACKS.find(m => m !== model) : undefined;
  const candidates: CompositionModel[] = fallback ? [model, fallback] : [model];
  const systemInstruction = style === 'balanced' ? singleDraftInstructions : `${singleDraftInstructions}\n\n${STYLE_GUIDANCE[style]}`;
  try {
    let body: any;
    for (let i = 0; i < candidates.length; i++) {
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const targetModel = candidates[i];
      resolvedModel = targetModel;
      const generationConfig = isSynthetic
        ? { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'medium' } }
        : targetModel === COMPOSITION_MODEL
          ? { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 16384, thinkingConfig: { thinkingLevel: 'medium' } }
          : { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 16384, thinkingConfig: { thinkingLevel: 'low' } };
      attempts++;
      const response = proxyEndpoint
        ? await fetch(proxyEndpoint, {
            method: 'POST',
            redirect: 'error',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({ model: targetModel, systemInstruction, wire, generationConfig }),
          })
        : await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`, {
            method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: controller.signal,
            body: JSON.stringify({ systemInstruction: { parts: [{ text: systemInstruction }] }, contents: [{ role: 'user', parts: [{ text: wire }] }], generationConfig }),
          });
      if (!response.ok) {
        if (!isSynthetic && (response.status === 503 || response.status === 504) && i < candidates.length - 1 && !controller.signal.aborted) {
          await response.body?.cancel().catch(() => {});
          continue;
        }
        const message = await providerFailureMessage(response, controller.signal);
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        throw new TailorError('provider', message);
      }
      try {
        body = await readBoundedJson(response, controller.signal, MAX_RESPONSE_BYTES);
      } catch (err) {
        if (err instanceof BoundedResponseError) {
          if (err.kind === 'aborted') throw new DOMException('Aborted', 'AbortError');
          if (err.kind === 'oversized') throw new TailorError('invalid', 'Oversized response. Your resumes are unchanged.');
          throw new TailorError('invalid', 'Invalid response JSON. Your resumes are unchanged.');
        }
        throw err;
      }
      const u = body?.usageMetadata ?? {};
      const count = (k: string) => Number.isSafeInteger(u[k]) && u[k] >= 0 ? u[k] as number : undefined;
      usage = addUsage(usage, { input: count('promptTokenCount'), output: count('candidatesTokenCount'), thoughts: count('thoughtsTokenCount'), total: count('totalTokenCount') });
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const finishReason = typeof body?.candidates?.[0]?.finishReason === 'string' ? body.candidates[0].finishReason : '';
      const complete = Array.isArray(body?.candidates) && body.candidates.length === 1 && finishReason === 'STOP';
      if (!complete) {
        const safeFinish = /^(?:MAX_TOKENS|SAFETY|RECITATION|OTHER|BLOCKLIST|PROHIBITED_CONTENT)$/.test(finishReason) ? ` (${finishReason})` : '';
        throw new TailorError('incomplete', `No completed response${safeFinish}. No partial resume or automatic retry.`);
      }
      break;
    }
    const parts: unknown = body?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts) || parts.some(p => !p || typeof p !== 'object' || (!p.thought && typeof p.text !== 'string'))) throw new TailorError('invalid', 'Invalid response format. Your resumes are unchanged.');
    const text = parts.filter(p => !p.thought).map(p => p.text).join('');
    if (!text || text.length > 100000) throw new TailorError('invalid', 'Empty or oversized response. Your resumes are unchanged.');
    let raw: unknown; try { raw = JSON.parse(text); } catch { throw new TailorError('invalid', 'Invalid response JSON. Your resumes are unchanged.'); }
    status = 'success'; return raw;
  } catch (e) {
    if (signal.aborted) { status = 'cancelled'; reason = 'cancelled'; throw new TailorError(reason, 'Cancelled. No copy was created; provider processing may already have started.'); }
    reason = timedOut ? 'timeout' : e instanceof TailorError ? e.code : 'network';
    if (e instanceof TailorError) throw e;
    throw new TailorError(reason, timedOut ? 'Request timed out. No automatic retry.' : 'Request could not complete. No automatic retry.');
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', abort);
    const usageId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    saveTailorUsage({ id: usageId, at: new Date().toISOString(), model: resolvedModel, elapsedMs: Math.round(performance.now() - started), attempts: isSynthetic ? 1 : attempts, status, reason, ...usage });
  }
}