/**
 * Narrow warning for explicit degree-completion claims against one cited,
 * explicitly unfinished education record. It does not infer status from dates,
 * verify qualifications, parse all grammar, or resolve multiple credentials.
 */
type Evidence = { kind: string; text: string };
const normalized = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[’]/gu, "'");
const degree = /\b(?:degree|bachelor(?:'s)?|master(?:'s)?|doctorate|doctoral|ph\.?d\.?|b\.?sc\.?|m\.?sc\.?)\b/u;
const unfinished = /\b(?:in[\s-]+progress|ongoing|currently\s+(?:pursuing|studying|enrolled)|pursuing|not\s+(?:yet\s+)?completed|unfinished)\b/u;

function completedDegree(text: string): boolean {
  const value = normalized(text);
  // Limit the verb-to-credential match to a short credential phrase; e.g.
  // "completed coursework while pursuing a degree" is not degree completion.
  const forward = /\b(?:earned|completed|obtained|received|holds?|holding|awarded|graduated\s+with)\s+(?:(?:a|an|the|my|his|her|their)\s+)?(?:bachelor(?:'s)?|master(?:'s)?|doctoral|doctorate|degree|ph\.?d\.?|b\.?sc\.?|m\.?sc\.?)\b/gu;
  for (const match of value.matchAll(forward)) {
    const before = value.slice(Math.max(0, match.index - 24), match.index);
    if (!/\b(?:not|never|hasn't|haven't|hadn't|didn't)\s+(?:yet\s+)?$/u.test(before)) return true;
  }
  return /\b(?:bachelor(?:'s)?|master(?:'s)?|doctoral|doctorate|degree)(?:\s+degree)?\s+(?:(?:is|was|has\s+been)\s+)?(?:completed|earned|obtained|awarded|conferred)\b/u.test(value);
}

export function incompleteDegreeConflict(text: string, cited: readonly Evidence[]): boolean {
  const education = cited.filter(f => f.kind === 'education');
  // Multiple qualifications can legitimately support distinct status claims.
  // Do not guess which credential the model meant in that case.
  if (education.length !== 1 || cited.some(f => f.kind === 'certification')) return false;
  const source = normalized(education[0].text);
  // Projected education fields are separated by ·; do not attach an unrelated
  // "coursework in progress" description to an already-completed degree.
  if (!source.split(/\s+·\s+/u).some(field => degree.test(field) && unfinished.test(field))) return false;
  if (cited.some(f => completedDegree(f.text))) return false;
  return completedDegree(text);
}
