import type { ZodError } from 'zod';

export type DiagnosticSection = 'summary' | 'edits' | 'requirements' | 'skillOrder' | 'skillGroups' | 'bulletOrder';
export type RowDiagnostic = {
  section: DiagnosticSection; row: number; issues: string[];
  // Allowlisted, bounded display only; never a patch and never persisted.
  content: Record<string, string>;
};
export type CompositionDiagnostics = {
  version: 'response-diagnostics-b26';
  received: Record<DiagnosticSection, number>;
  forwarded: Record<DiagnosticSection, number>;
  omitted: RowDiagnostic[];
};
const fields = new Set(['jobTitle','company','summary','edits','requirements','skillOrder','skillGroups','bulletOrder',
  'experience','projects','overview','bullets','text','evidenceIds','target','before','after','why','requirementId','id','status','entryId','bulletIds','category','skillIds']);
// Never print arbitrary key names, received values, enum alternatives or Zod messages.
export function formatIssues(error: ZodError): string[] {
  return error.issues.slice(0, 12).map(issue => {
    const path = issue.path.map(p => typeof p === 'number' ? `[${p + 1}]` : fields.has(p) ? p : '[unlisted field]').join('.');
    let reason: string;
    if (issue.code === 'too_big') reason = `exceeds maximum ${issue.maximum} (${issue.type})`;
    else if (issue.code === 'too_small') reason = `below minimum ${issue.minimum} (${issue.type})`;
    else if (issue.code === 'invalid_type') reason = `expected ${issue.expected}`;
    else if (issue.code === 'unrecognized_keys') reason = 'unexpected field(s); names and values withheld';
    else if (issue.code === 'invalid_enum_value') reason = 'value is outside the allowed options';
    else reason = 'invalid format';
    return `${path || '(row)'}: ${reason}`;
  });
}
function displayText(value: string) {
  // Best effort only, not a secret scanner. Unknown fields are never retained.
  return value.slice(0, 2000)
    .replace(/AIza[\w-]{20,}/g, '[redacted key]')
    .replace(/sk-[\w-]{12,}/g, '[redacted key]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_ -]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    + (value.length > 2000 ? ' … [display truncated; not applied]' : '');
}
function contentSnapshot(section: DiagnosticSection, raw: unknown): Record<string,string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const value = raw as Record<string,unknown>, result: Record<string,string> = {};
  const allowed: Record<DiagnosticSection,string[]> = {
    summary:['text'], edits:['before','after','why','text','overview'], requirements:['status'],
    skillOrder:[], skillGroups:['category'], bulletOrder:[],
  };
  for (const key of allowed[section]) if (typeof value[key] === 'string') {
    if(key==='status'&&!['supported','related','not_found'].includes(value[key])) result[key]='[invalid value withheld]';
    else if(key==='category'&&!['Technical','Soft','Tools','Languages'].includes(value[key])) result[key]='[invalid value withheld]';
    else result[key] = displayText(value[key]);
  }
  // Store known reference aliases only; arbitrary IDs may contain private data.
  for (const key of ['id','target','requirementId','entryId']) {
    if (typeof value[key] === 'string' && /^(?:r\d+|work_\d+(?:_bullet_\d+)?|project_\d+(?:_bullet_\d+)?|skill_\d+|summary|headline)$/.test(value[key])) result[key] = value[key];
  }
  if (Array.isArray(value.evidenceIds)) result.evidenceCount = String(value.evidenceIds.length);
  return result;
}
export function omittedRow(section: DiagnosticSection, row: number, raw: unknown, issues: string[]): RowDiagnostic {
  return { section, row: row + 1, issues: issues.slice(0,12), content: contentSnapshot(section,raw) };
}
export function newDiagnostics(value: Record<DiagnosticSection,unknown[]>): CompositionDiagnostics {
  const received = {} as CompositionDiagnostics['received'], forwarded = {} as CompositionDiagnostics['forwarded'];
  for (const section of ['summary','edits','requirements','skillOrder','skillGroups','bulletOrder'] as const) {
    received[section] = value[section].length; forwarded[section] = 0;
  }
  return { version:'response-diagnostics-b26', received, forwarded, omitted:[] };
}
// Intentionally excludes all snapshots, resume/job text and arbitrary model values.
export function diagnosticReport(d: CompositionDiagnostics): string {
  return JSON.stringify({version:d.version,received:d.received,forwarded:d.forwarded,
    omitted:d.omitted.map(({section,row,issues})=>({section,row,issues}))},null,2);
}
