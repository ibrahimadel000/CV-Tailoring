import { editorialOutputSchema } from './editorial';
import { v4 as uuid } from 'uuid';
import { TailorError } from '@/services/tailorModel';
import { getTailorConnection, TAILOR_MODEL, REQUEST_TIMEOUT_MS, saveTailorUsage, type TokenUsage, type TailorUsageRecord } from '@/services/tailorRequest';
import { selectorPrompt, realizerPrompt } from './prompts';
import { realizationOutputSchema } from './pipeline';
export type ContentStage = 'selection' | 'writing';
// Development only. Never enable a VITE key in a publicly deployed application.
const key = import.meta.env.DEV ? (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim() : '';
export async function requestContent(stage: ContentStage, wire: unknown, signal: AbortSignal): Promise<unknown> {
  if (!getTailorConnection().ready) throw new TailorError('configuration', 'AI is not connected. Local testing requires the existing development setup; public deployment requires a secure server adapter.');
  const data = JSON.stringify(wire);
  if (data.length > 180000) throw new TailorError('input', 'This source exceeds the request budget. Nothing was sent.');
  if (signal.aborted) throw new TailorError('cancelled', 'Cancelled. Nothing was sent.');
  const controller = new AbortController(), started = performance.now();
  let timedOut = false, usage: TokenUsage = {}, status: TailorUsageRecord['status'] = 'failed', reason: string | undefined;
  const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TAILOR_MODEL}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: controller.signal,
      body: JSON.stringify({ systemInstruction: { parts: [{ text: stage === 'selection' ? selectorPrompt : realizerPrompt }] }, contents: [{ role: 'user', parts: [{ text: data }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: stage === 'selection' ? editorialOutputSchema : realizationOutputSchema, temperature: 0.2, candidateCount: 1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 1024 } } }),
    });
    if (!response.ok) {
      const code = response.status === 429 ? 'quota' : response.status === 401 || response.status === 403 ? 'authentication' : response.status === 404 ? 'model_unavailable' : response.status >= 500 ? 'provider_unavailable' : 'provider_request';
      throw new TailorError(code, `Google rejected this stage (HTTP ${response.status}; ${code}). No automatic retry. Your resumes are unchanged.`);
    }
    const body = await response.json();
    const u = body?.usageMetadata ?? {}, count = (k: string) => Number.isSafeInteger(u[k]) && u[k] >= 0 ? u[k] as number : undefined;
    usage = { input: count('promptTokenCount'), output: count('candidatesTokenCount'), thoughts: count('thoughtsTokenCount'), total: count('totalTokenCount'), cached: count('cachedContentTokenCount') };
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const candidates = body?.candidates;
    if (!Array.isArray(candidates) || candidates.length !== 1 || candidates[0]?.finishReason !== 'STOP') throw new TailorError('incomplete', 'Model did not return one completed response. No partial result or automatic retry.');
    const parts = candidates[0]?.content?.parts;
    if (!Array.isArray(parts) || parts.some((p: { text?: unknown; thought?: unknown }) => !p.thought && typeof p.text !== 'string')) throw new TailorError('invalid', 'The response did not contain valid text. No automatic retry.');
    const text = parts.filter((p: { thought?: unknown }) => !p.thought).map((p: { text: string }) => p.text).join('');
    if (!text || text.length > 100000) throw new TailorError('invalid', 'The response was empty or exceeded the response budget. No automatic retry.');
    let raw: unknown; try { raw = JSON.parse(text); } catch { throw new TailorError('invalid', 'The response was not valid JSON. No automatic retry.'); }
    status = 'success'; return raw;
  } catch (e) {
    reason = e instanceof TailorError ? e.code : timedOut ? 'timeout' : signal.aborted ? 'cancelled' : 'network';
    if (signal.aborted) { status = 'cancelled'; throw new TailorError('cancelled', 'Cancelled. Existing resumes are unchanged.'); }
    if (e instanceof TailorError) throw e;
    throw new TailorError(reason, timedOut ? 'The stage timed out. No automatic retry.' : 'The stage could not complete. No automatic retry.');
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', abort);
    saveTailorUsage({ id: `b29-${stage}-${uuid()}`, at: new Date().toISOString(), model: TAILOR_MODEL, elapsedMs: Math.round(performance.now() - started), attempts: 1, status, reason, ...usage });
  }
}
