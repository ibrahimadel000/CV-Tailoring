/**
 * Narrow, deterministic summary boundary. This is NOT an entailment check.
 * A literal skill name in a cited non-skill fact does not prove practice,
 * proficiency, attribution, negation or scope. Unnamed/aliased claims can escape.
 * Call only after validating the whole response's shape, references and limits.
 */
type Fact = { id: string; kind: string; text: string };
export type SummaryUnit = { text: string; sourceIds: string[] };
export type SummarySkill = { id: string; name: string };
export type SummaryRemoval = {
  segmentIndex: number;
  reason: 'skill-only-evidence' | 'skill-absent-from-narrative';
  skillIds: string[];
};
const normalized = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
const tokenCharacter = /[\p{L}\p{N}\p{M}_+#]/u;

/** Literal names only, with Unicode token boundaries; no aliases or skill taxonomy. */
function hasBoundedMatch(value: string, needle: string): boolean {
  for (let at = value.indexOf(needle); at !== -1; at = value.indexOf(needle, at + 1)) {
    const before = Array.from(value.slice(0, at)).pop() || '';
    const after = Array.from(value.slice(at + needle.length))[0] || '';
    if (!tokenCharacter.test(before) && !tokenCharacter.test(after)) return true;
  }
  return false;
}

export function containsSkillName(text: string, name: string): boolean {
  const value = normalized(text), needle = normalized(name);
  if (!needle) return false;
  if (hasBoundedMatch(value, needle)) return true;
  const allowPluralFold = needle.includes(' ') || /\b[A-Z]{2,}s?\b/.test(name.trim());
  if (allowPluralFold && needle.length >= 3) {
    if (needle.endsWith('ies') && hasBoundedMatch(value, `${needle.slice(0, -3)}y`)) return true;
    if (needle.endsWith('y') && hasBoundedMatch(value, `${needle.slice(0, -1)}ies`)) return true;
    if (needle.endsWith('s') && !needle.endsWith('ss') && hasBoundedMatch(value, needle.slice(0, -1))) return true;
    if (!needle.endsWith('s') && hasBoundedMatch(value, `${needle}s`)) return true;
  }
  if (needle.includes(' ') || needle.includes('-')) {
    const spacedValue = value.replace(/[\-\u2010-\u2015]+/gu, ' ').replace(/\s+/gu, ' ');
    const spacedNeedle = needle.replace(/[\-\u2010-\u2015]+/gu, ' ').replace(/\s+/gu, ' ');
    if (hasBoundedMatch(spacedValue, spacedNeedle)) return true;
  }
  return false;
}

export function applySummaryBoundary(
  evidence: readonly Fact[], skills: readonly SummarySkill[], units: readonly SummaryUnit[],
) {
  const facts = new Map(evidence.map(f => [f.id, f]));
  const retained: SummaryUnit[] = [], retainedIndices: number[] = [], removals: SummaryRemoval[] = [];
  for (const [segmentIndex, unit] of units.entries()) {
    const cited = unit.sourceIds.map(id => facts.get(id));
    // Do not turn an unknown reference into a recoverable wording omission.
    if (!cited.length || cited.some(f => !f)) throw Error('Summary boundary requires validated source references.');
    const narrative = cited.filter((f): f is Fact => !!f && f.kind !== 'skill');
    const absent = skills.filter(s => containsSkillName(unit.text, s.name)
      && !narrative.some(f => containsSkillName(f.text, s.name)));
    if (!narrative.length || absent.length) {
      removals.push({
        segmentIndex,
        reason: narrative.length ? 'skill-absent-from-narrative' : 'skill-only-evidence',
        skillIds: absent.map(s => s.id),
      });
    } else {
      // Copy, never rewrite or splice part of a generated sentence.
      retained.push({ text: unit.text, sourceIds: [...unit.sourceIds] });
      retainedIndices.push(segmentIndex);
    }
  }
  return { retained, retainedIndices, removals };
}

/** User-facing wording for one boundary removal. Copy lives here, not at call sites. */
export function summaryRemovalMessage(removal: SummaryRemoval): string {
  return removal.reason === 'skill-only-evidence'
    ? 'Removed a generated summary passage that relied only on skill-list evidence. Skills remain available for selection in the Skills section.'
    : 'Removed a generated summary passage naming a skill absent from its cited non-skill facts. Literal presence is not factual verification of the remaining text.';
}

export function summaryBoundaryNotice(removed: number, remaining: number): string {
  if (!removed) return '';
  return `${removed} generated summary passage${removed === 1 ? ' was' : 's were'} removed under the skill-evidence rule. ${
    remaining ? 'Review the remaining summary before export.' : 'No generated summary remains; you can write one in the editor.'
  } No automatic rewrite or retry was made.`;
}