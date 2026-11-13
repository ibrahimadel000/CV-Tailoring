import type { EducationEntry } from '@/types/schema';
// Conservative reconciliation, not inference: the structured education entry is
// authoritative only when the FULL header degree + institution match uniquely.
const normalized = (s: string) => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}+#]/gu, '');
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
  let statusReviewNeeded = false;
  for (let i = 0; i < lines.length;) {
    let match: { size: number; entryId: string } | undefined;
    // PDF lines and DOCX paragraphs lose their provenance during extraction.
    // Never suppress a multi-line match: adjacent independent notes could make
    // the same string. Also retain a single-line match with a following line,
    // because that line might be a continuation of the institution.
    const pair = headerPair(lines[i]);
    if (pair && (i + 1 === lines.length || !lines[i + 1].trim())) {
      const candidates = entries.filter(e => degreeKey(e.degree) === pair.degree && normalized(e.institution) === pair.institution);
      if (candidates.length === 1 && !candidates[0].description?.trim()) match = { size: 1, entryId: candidates[0].id };
    }
    // Only alert for a complete contiguous header span (up to three lines).
    // This does not infer identity or alter either record.
    if (!match) {
      let end = i;
      while (end < lines.length && end - i < 3 && lines[end].trim()) end++;
      if (end === lines.length || !lines[end].trim()) {
        const joined = lines.slice(i, end).join(' ');
        const withoutStatus = joined.replace(/\s*\(\s*in\s+progress\s*\)(?=\s+[–—|·-]\s+)/i, '');
        const possible = withoutStatus !== joined ? headerPair(withoutStatus) : undefined;
        if (possible) {
          const sameInstitution = entries.filter(e => normalized(e.institution) === possible.institution);
          const unqualified = sameInstitution.filter(e => degreeKey(e.degree) === possible.degree);
          // Do not infer status from free-text descriptions (which may negate it).
          const hasStatus = sameInstitution.some(e => degreeKey(e.degree) === headerPair(joined)?.degree);
          if (unqualified.length === 1 && !hasStatus) statusReviewNeeded = true;
        }
      }
    }
    if (match) { matches.push({ entryId: match.entryId, sourceLines: lines.slice(i, i + match.size) }); i += match.size; }
    else { remaining.push(lines[i]); i++; }
  }
  return { remaining, matches, statusReviewNeeded };
}
