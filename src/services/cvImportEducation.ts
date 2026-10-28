import type { EducationEntry } from '@/types/schema';
// Conservative reconciliation, not inference: the structured education entry is
// authoritative only when the FULL header degree + institution match uniquely.
const normalized = (s: string) => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function degreeKey(s: string): string | undefined {
  // Limited aliases for the same level/field. Keep all field and status words:
  // incomplete/completed, different majors, awards or years must not be merged.
  const value = s.trim().toLowerCase();
  const prefix = /^(?:b\.?\s?sc\.?\s+|bachelor\s+of\s+science\s+(?:in\s+)?|bachelor\s+(?:of\s+)?)/i.exec(value);
  if (!prefix) return;
  return 'bachelor:' + normalized(value.slice(prefix[0].length));
}
function headerPair(value: string) {
  const parts = value.split(/\s+[–—|·-]\s+/);
  if (parts.length !== 2) return;
  const degree = degreeKey(parts[0]);
  if (!degree || !parts[1].trim()) return;
  return { degree, institution: normalized(parts[1]) };
}
export function reconcileHeaderEducation(lines: string[], entries: EducationEntry[]) {
  const remaining: string[] = [], matches: { entryId: string; sourceLines: string[] }[] = [];
  for (let i = 0; i < lines.length;) {
    let match: { size: number; entryId: string } | undefined;
    // A short wrapped header can span lines, but never cross its original block.
    // Do not join arbitrary lines unless the entire resulting pair is supported.
    for (let size = 1; size <= 3 && i + size <= lines.length; size++) {
      const pair = headerPair(lines.slice(i, i + size).join(' '));
      if (!pair) continue;
      const candidates = entries.filter(e => degreeKey(e.degree) === pair.degree && normalized(e.institution) === pair.institution && !e.description?.trim());
      // Multiple matching programs/periods are ambiguous; retain source text.
      if (candidates.length === 1) {
        if (match) { match = undefined; break; }
        match = { size, entryId: candidates[0].id };
      }
    }
    if (match) { matches.push({ entryId: match.entryId, sourceLines: lines.slice(i, i + match.size) }); i += match.size; }
    else { remaining.push(lines[i]); i++; }
  }
  return { remaining, matches };
}
