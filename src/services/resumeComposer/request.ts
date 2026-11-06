import { providerFailureMessage } from './providerDiagnostics';
import type { NaturalPacket } from './naturalDocument';
import { singleDraftInstructions, prepareSingleDraftRequest } from './singleDraftRequest';
import { TailorError } from '@/services/tailorModel';
import { getTailorConnection, saveTailorUsage, type TokenUsage } from '@/services/tailorRequest';
export const COMPOSITION_MODEL = 'gemini-3.5-flash-lite';
// Explicit, bounded development choices; never silently switch or retry.
export const COMPOSITION_MODELS = [
  { id: COMPOSITION_MODEL, label: 'Gemini 3.5 Flash-Lite' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
] as const;
export type CompositionModel = typeof COMPOSITION_MODELS[number]['id'];
export const COMPOSITION_TIMEOUT_MS = 300000;
export const COMPOSITION_PREVIEW_LABEL = 'Single-draft preview · Gemini 3.5 Flash-Lite · experimental';
// Development adapter only. Public builds need a server; no client production key.
const key = import.meta.env.DEV ? (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim() : '';
export async function requestComposition(packet: NaturalPacket, signal: AbortSignal, model: CompositionModel = COMPOSITION_MODEL): Promise<unknown> {
  if (!COMPOSITION_MODELS.some(option => option.id === model)) throw new TailorError('configuration', 'Unsupported model. Nothing was sent.');
  if (signal.aborted) throw new TailorError('cancelled', 'Cancelled. Nothing was sent.');
  if (!getTailorConnection().ready) throw new TailorError('configuration', 'AI is not connected. Public deployment requires a secure server adapter.');
  const { responseSchema: schema, wire } = prepareSingleDraftRequest(packet);
  if (wire.length > 180000) throw new TailorError('input', 'Source exceeds the request budget. Nothing was sent.');
  const controller = new AbortController(), started = performance.now();
  let timedOut = false, status: 'success' | 'failed' | 'cancelled' = 'failed', reason = '', usage: TokenUsage = {};
  const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, COMPOSITION_TIMEOUT_MS);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: controller.signal,
      body: JSON.stringify({ systemInstruction: { parts: [{ text: singleDraftInstructions }] }, contents: [{ role: 'user', parts: [{ text: wire }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'medium' } } }),
    });
    if (!response.ok) {
      const message = await providerFailureMessage(response);
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new TailorError('provider', message);
    }
    // Never retain raw error bodies, prompts or content in usage diagnostics.
    const body = await response.json(), u = body?.usageMetadata ?? {};
    const count = (k: string) => Number.isSafeInteger(u[k]) && u[k] >= 0 ? u[k] as number : undefined;
    usage = { input: count('promptTokenCount'), output: count('candidatesTokenCount'), thoughts: count('thoughtsTokenCount'), total: count('totalTokenCount') };
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!Array.isArray(body?.candidates) || body.candidates.length !== 1 || body.candidates[0]?.finishReason !== 'STOP') throw new TailorError('incomplete', 'No completed response. No partial resume or automatic retry.');
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
    throw new TailorError(reason, timedOut ? 'Request timed out. No automatic retry.' : 'Request could not complete. No automatic retry.');
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', abort);
    saveTailorUsage({ id: crypto.randomUUID(), at: new Date().toISOString(), model, elapsedMs: Math.round(performance.now() - started), attempts: 1, status, reason, ...usage });
  }
}
