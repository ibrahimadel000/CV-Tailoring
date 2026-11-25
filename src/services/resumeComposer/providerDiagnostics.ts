// Allowlisted provider diagnostics only. Never display or retain raw error.message,
// metadata, project IDs, URLs, keys, prompts or response bodies.
import { BoundedResponseError, readBoundedJson } from './boundedResponse';

const MAX_ERROR_BYTES = 32768;
const statuses = new Set(['RESOURCE_EXHAUSTED', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'INVALID_ARGUMENT', 'NOT_FOUND', 'UNAVAILABLE', 'INTERNAL', 'DEADLINE_EXCEEDED', 'FAILED_PRECONDITION']);
const reasons = new Set(['RATE_LIMIT_EXCEEDED', 'QUOTA_EXCEEDED', 'API_KEY_INVALID', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED', 'SERVICE_DISABLED', 'BILLING_DISABLED', 'CONSUMER_INVALID', 'LOCATION_POLICY_VIOLATED']);
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function seconds(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{1,6}(?:\.\d{1,9})?s?$/.test(value)) return;
  const n = Number(value.replace(/s$/, ''));
  return Number.isFinite(n) && n >= 0 && n <= 86400 ? n : undefined;
}
async function boundedError(response: Response, signal?: AbortSignal): Promise<unknown> {
  try {
    return await readBoundedJson(response, signal, MAX_ERROR_BYTES);
  } catch (err) {
    if (err instanceof BoundedResponseError && err.kind === 'aborted') throw err;
    return undefined;
  }
}
function quotaLabel(value: Record<string, unknown>): string | undefined {
  const metrics: Record<string, string> = {
    'generativelanguage.googleapis.com/generate_content_free_tier_requests': 'requests (free tier)',
    'generativelanguage.googleapis.com/generate_content_free_tier_input_token_count': 'input tokens (free tier)',
    'generativelanguage.googleapis.com/generate_content_paid_tier_requests': 'requests (paid tier)',
    'generativelanguage.googleapis.com/generate_content_paid_tier_input_token_count': 'input tokens (paid tier)',
  };
  const metric = typeof value.quotaMetric === 'string' && Object.prototype.hasOwnProperty.call(metrics, value.quotaMetric) ? metrics[value.quotaMetric] : undefined;
  if (!metric) return;
  const id = typeof value.quotaId === 'string' ? value.quotaId : '';
  // Derive only fixed labels; never reflect the quota ID or dimensions verbatim.
  const period = /^Generate(?:Requests|ContentInputTokens|ContentOutputTokens)(?:PerDayPer(?:ProjectPerModel|Model)|PerModelPerDay)(?:-FreeTier)?$/.test(id) ? '/day' : /^Generate(?:Requests|ContentInputTokens|ContentOutputTokens)(?:PerMinutePer(?:ProjectPerModel|Model)|PerModelPerMinute)(?:-FreeTier)?$/.test(id) ? '/minute' : ' (period not reported)';
  let limit = '';
  if (typeof value.quotaValue === 'string' && /^\d{1,10}$/.test(value.quotaValue) && Number(value.quotaValue) <= 1000000000) limit = `; reported limit: ${Number(value.quotaValue)}`;
  return metric + period + limit;
}
export async function providerFailureMessage(response: Response, signal?: AbortSignal): Promise<string> {
  const fields: string[] = []; let retry: number | undefined;
  try {
    retry = seconds(response.headers?.get('retry-after'));
    const error = object(object(await boundedError(response, signal))?.error);
    if (error && (error.code === undefined || error.code === response.status)) {
      if (typeof error.status === 'string' && statuses.has(error.status)) fields.push(error.status);
      if (Array.isArray(error.details)) for (const raw of error.details.slice(0, 16)) {
        const detail = object(raw); if (!detail) continue;
        if (detail['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' && detail.domain === 'googleapis.com' && typeof detail.reason === 'string' && reasons.has(detail.reason)) fields.push(detail.reason);
        if (detail['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure' && Array.isArray(detail.violations)) for (const rawViolation of detail.violations.slice(0, 8)) {
          const violation = object(rawViolation), label = violation && quotaLabel(violation);
          if (label) fields.push('quota: ' + label);
        }
        if (detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo') retry = seconds(detail.retryDelay) ?? retry;
      }
    }
  } catch (err) {
    if (err instanceof BoundedResponseError && err.kind === 'aborted') throw new DOMException('Aborted', 'AbortError');
    /* Malformed, oversized or unreadable errors stay generic. */
  }
  const safe = [...new Set(fields)].slice(0, 8);
  const note = safe.length ? ' Provider-reported details, not a verification of account usage.' : '';
  const hint = retry !== undefined ? ` Provider retry hint: ${retry}s (not a guarantee).` : '';
  const isProxyError = response.headers?.get?.('x-tailor-error-source') === 'proxy';
  const actor = isProxyError ? 'The tailoring server' : 'Google';
  return `${actor} rejected the request (HTTP ${response.status}${safe.length ? '; ' + safe.join('; ') : ''}).${note}${hint} No automatic retry. Your resumes are unchanged.`;
}
