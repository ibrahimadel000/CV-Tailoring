import { providerFailureMessage } from './providerDiagnostics';
import { fallbackDelayMs, waitForFallback } from './failoverBackoff';
import { inspectRetryAdvice } from './retryInfo';
import type { NaturalPacket } from './naturalDocument';
import { singleDraftInstructions, prepareSingleDraftRequest } from './singleDraftRequest';
import { TailorError } from '@/services/tailorModel';
import { getTailorConnection, saveTailorUsage, type TokenUsage } from '@/services/tailorRequest';
export const COMPOSITION_MODEL = 'gemini-3.8-flash';
// Explicit, bounded development choices; never silently switch or retry in synthetic tests.
export const COMPOSITION_MODELS = [
  { id: COMPOSITION_MODEL, label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
] as const;
export type CompositionModel = typeof COMPOSITION_MODELS[number]['id'];
export const COMPOSITION_TIMEOUT_MS = 300000;
// Restricted to transient server/gateway statuses; do not retry quota, auth or 505.
export const TRANSIENT_HTTP_STATUSES = [500, 502, 503, 504] as const;
export const COMPOSITION_PREVIEW_LABEL = 'Single-draft preview · Gemini 3.8 Flash · experimental';
// Development adapter only. Public builds need a server; no client production key.
const key = import.meta.env.DEV ? (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim() : '';
const LIVE_FALLBACKS: CompositionModel[] = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
// Gemini 3.5 Flash is an alias routed to 3.6 Flash by Google, not an independent fallback.
// Shared with the UI so its disclosure cannot drift from the transport order.
export function liveCompositionCandidates(model: CompositionModel): CompositionModel[] {
  return [model, ...LIVE_FALLBACKS.filter(m => m !== model)];
}
export async function requestComposition(packet: NaturalPacket, signal: AbortSignal, model: CompositionModel = COMPOSITION_MODEL): Promise<unknown> {
  if (!COMPOSITION_MODELS.some(option => option.id === model)) throw new TailorError('configuration', 'Unsupported model. Nothing was sent.');
  if (signal.aborted) throw new TailorError('cancelled', 'Cancelled. Nothing was sent.');
  if (!getTailorConnection().ready) throw new TailorError('configuration', 'AI is not connected. Public deployment requires a secure server adapter.');
  const { responseSchema: schema, wire } = prepareSingleDraftRequest(packet);
  if (wire.length > 180000) throw new TailorError('input', 'Source exceeds the request budget. Nothing was sent.');
  const controller = new AbortController(), started = performance.now();
  let timedOut = false, status: 'success' | 'failed' | 'cancelled' = 'failed', reason = '', usage: TokenUsage = {}, attempts = 0, lastModel: CompositionModel | undefined;
  const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, COMPOSITION_TIMEOUT_MS);
  const isSynthetic = /^synthetic-/i.test(key);
  const candidates: CompositionModel[] = isSynthetic ? [model] : liveCompositionCandidates(model);
  try {
    let response: Response | undefined, body: any;
    for (let i = 0; i < candidates.length; i++) {
      const targetModel = candidates[i];
      const generationConfig = isSynthetic
        ? { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'medium' } }
        : targetModel === 'gemini-3.5-flash-lite'
          ? { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 16384, thinkingConfig: { thinkingLevel: 'medium' } }
          : { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 24576, thinkingConfig: { thinkingLevel: 'low' } };
      attempts++; lastModel = targetModel; usage = {};
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`, {
        method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: controller.signal,
        body: JSON.stringify({ systemInstruction: { parts: [{ text: singleDraftInstructions }] }, contents: [{ role: 'user', parts: [{ text: wire }] }], generationConfig }),
      });
      if (!response.ok) {
        if (!isSynthetic && TRANSIENT_HTTP_STATUSES.some(status => status === response!.status)) {
          // Respect both exposed HTTP and bounded Google RetryInfo hints.
          // Unknown/oversized/stalled JSON stops rather than guessing an early retry.
          const inspection = await inspectRetryAdvice(response, controller.signal);
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (!inspection.ok) {
            const retryNote = attempts > 1 ? ` ${attempts} model requests were attempted. No further automatic retry.` : ' No automatic retry.';
            throw new TailorError('provider', `The AI service returned HTTP ${response.status}, but retry timing could not be safely checked.${retryNote} Your resumes are unchanged.`);
          }
          const delay = fallbackDelayMs(response.headers.get('retry-after'), i, undefined, undefined, inspection.retryMs);
          if (delay !== null && i < candidates.length - 1) {
            await waitForFallback(delay, controller.signal);
            continue;
          }
          // Reconstruct only the bounded error body for the existing allowlisted diagnostic.
          response = new Response(inspection.body, { status: response.status, headers: response.headers });
        }
        const message = await providerFailureMessage(response, attempts);
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        throw new TailorError('provider', message);
      }
      body = await response.json();
      const u = body?.usageMetadata ?? {};
      const count = (k: string) => Number.isSafeInteger(u[k]) && u[k] >= 0 ? u[k] as number : undefined;
      usage = { input: count('promptTokenCount'), output: count('candidatesTokenCount'), thoughts: count('thoughtsTokenCount'), total: count('totalTokenCount') };
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      // A prompt/candidate restriction must never be bypassed by trying another
      // model. Never reflect provider text or partial output in diagnostics.
      const restrictedReasons = new Set(['SAFETY', 'RECITATION', 'LANGUAGE', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'IMAGE_RECITATION']);
      const blockReason = body?.promptFeedback?.blockReason;
      const promptBlocked = blockReason !== undefined && blockReason !== null && blockReason !== '';
      const blockedRatings = (value: unknown) => Array.isArray(value) && value.some(r => r?.blocked === true);
      const candidateList = Array.isArray(body?.candidates) ? body.candidates : [];
      const restricted = promptBlocked || blockedRatings(body?.promptFeedback?.safetyRatings)
        || candidateList.some((candidate: any) => restrictedReasons.has(candidate?.finishReason) || blockedRatings(candidate?.safetyRatings));
      if (restricted) throw new TailorError('blocked', attempts > 1
        ? `Google blocked or restricted the request or response after ${attempts} model requests. No further automatic retry. Your resumes are unchanged.`
        : 'Google blocked or restricted the request or response. No automatic retry. Your resumes are unchanged.');
      const complete = candidateList.length === 1 && candidateList[0]?.finishReason === 'STOP';
      const outputLimit = candidateList.length === 1 && candidateList[0]?.finishReason === 'MAX_TOKENS';
      if (outputLimit && !isSynthetic && i < candidates.length - 1) continue;
      if (!complete) throw new TailorError('incomplete', attempts > 1 ? `No completed response after ${attempts} model requests. No partial resume or further automatic retry.` : 'No completed response. No partial resume or automatic retry.');
      break;
    }
    const parts: unknown = body.candidates[0]?.content?.parts;
    if (!Array.isArray(parts) || parts.some(p => !p || typeof p !== 'object' || (!p.thought && typeof p.text !== 'string'))) throw new TailorError('invalid', 'Invalid response format. Your resumes are unchanged.');
    const text = parts.filter(p => !p.thought).map(p => p.text).join('');
    if (!text || text.length > 100000) throw new TailorError('invalid', 'Empty or oversized response. Your resumes are unchanged.');
    let raw: unknown; try { raw = JSON.parse(text); } catch { throw new TailorError('invalid', 'Invalid response JSON. Your resumes are unchanged.'); }
    status = 'success'; return raw;
  } catch (e) {
    if (signal.aborted) { status = 'cancelled'; reason = 'cancelled'; throw new TailorError(reason, 'Cancelled. No copy was created; provider processing may already have started.'); }
    reason = timedOut ? 'timeout' : e instanceof TailorError ? e.code : 'network';
    if (e instanceof TailorError) throw e;
    const ending = attempts > 1 ? ` ${attempts} model requests were attempted. No further automatic retry.` : ' No automatic retry.';
    throw new TailorError(reason, (timedOut ? 'Request timed out.' : 'Request could not complete.') + ending + ' No tailored copy was created; the provider may still have processed or charged the request.');
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', abort);
    saveTailorUsage({ id: crypto.randomUUID(), at: new Date().toISOString(), model, lastModel, elapsedMs: Math.round(performance.now() - started), attempts, status, reason, ...usage });
  }
}
