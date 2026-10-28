import type { Issue } from './engine';
type Shape = true | { [key: string]: Shape } | [Shape];
const refs: Shape = [true], paragraph: Shape = { text: true, sourceIds: refs };
const selectionShape: Shape = {
  selection: { summaryWorkIds: refs, entries: [{ id: true, passageIds: refs, omittedIds: refs }], skillOrder: refs, omittedSkillIds: refs },
  editorial: { version: true, jobFocus: { purpose: true, priorities: [{ id: true, description: true, quote: true }] }, positioning: { text: true, sourceIds: refs },
    summary: { angle: true, contextIds: refs, skillIds: refs }, priorityLinks: [{ priorityId: true, sourceIds: refs, note: true }],
    entries: [{ id: true, angle: true, leadPassageIds: refs }], skills: [{ id: true, tier: true, priorityIds: refs, reason: true }], omissions: [{ id: true, reason: true }] }
};
const writingShape: Shape = { summary: paragraph, entries: [{ id: true, overview: paragraph, bullets: [paragraph] }] };
function mask(text: string) {
  return text.replace(/AIza[\w-]{20,}/g, '[redacted key]').replace(/sk-[\w-]{12,}/g, '[redacted key]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_ -]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted email]')
    .replace(/\+?\d[\d ()-]{6,}\d/g, '[redacted number]');
}
export type RejectedDiagnostics = {
  stage: 'selection' | 'writing'; issueCount: number; issues: Issue[]; issuesShortened: boolean;
  snapshot: unknown; snapshotLimited: boolean; notice: string;
};
// Read-only display snapshot, never a repaired candidate or a re-import format.
// Unknown keys are not traversed; nothing is persisted or transmitted here.
export function rejectedDiagnostics(stage: 'selection' | 'writing', raw: unknown, issues: Issue[]): RejectedDiagnostics {
  let budget = 70000, nodes = 2500, limited = false;
  const walk = (value: unknown, shape: Shape): unknown => {
    if (budget <= 0 || nodes-- <= 0) { limited = true; return '[snapshot budget reached]'; }
    if (shape === true) {
      if (typeof value === 'string') { const clean = mask(value), max = Math.min(2400, budget), text = clean.slice(0, max); budget -= text.length; if (clean.length > max) { limited = true; return text + ' [shortened for diagnostics]'; } return text; }
      if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
      return value === undefined ? undefined : '[unexpected value type]';
    }
    if (Array.isArray(shape)) { if (!Array.isArray(value)) return value === undefined ? undefined : '[expected array]'; if (value.length > 200) limited = true; const out: unknown[] = []; for (const x of value.slice(0, 200)) { if (budget <= 0 || nodes <= 0) { limited = true; break; } out.push(walk(x, shape[0])); } return out; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value === undefined ? undefined : '[expected object]';
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(shape)) if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = walk((value as Record<string, unknown>)[key], child);
    return out;
  };
  const snapshot = walk(raw, stage === 'selection' ? selectionShape : writingShape);
  return { stage, issueCount: issues.length, issues: issues.slice(0, 100).map(x => ({ path: mask(x.path).slice(0, 180), message: mask(x.message).slice(0, 700) })), issuesShortened: issues.length > 100,
    snapshot, snapshotLimited: limited, notice: 'Rejected model response, never applied or reusable as a candidate. Allowlisted fields only; known key/email/number patterns masked. Not a comprehensive privacy scan. Review before sharing. Snapshot may be shortened.' };
}
