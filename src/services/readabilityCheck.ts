/**
 * Deterministic, line-pinned readability and date-consistency linter for the live editor.
 * Zero AI calls; universal across all industries and roles.
 */
import type { BulletPoint, CVProfile } from '@/types/schema';

export interface ReadabilityHint {
  id: 'long-bullet' | 'passive-opener' | 'first-person' | 'repeated-opener' | 'long-summary' | 'reversed-dates' | 'mixed-date-style';
  message: string;
}

const PASSIVE_OPENER_RE = /^(?:responsible\s+for|duties\s+included|tasked\s+with|worked\s+on|helped\s+(?:with|to)|assisted\s+(?:with|in)|involved\s+in)\b/i;
// Safari-safe first-person detection (no regex lookbehind):
// - Matches "My"/"my"/"Me"/"me" while avoiding uppercase state/country codes ("ME", "MY"), ambiguous "mine", and hyphenated tokens ("my-service").
// - Matches standalone "I" followed by a verb/contraction while skipping Roman numerals ("Phase I was completed", "Level I managed").
const FIRST_PERSON_MY_ME_RE = /(?:^|[\s(,;])(?:[Mm]y|[Mm]e)(?![\w-])/;
const ROMAN_PREFIX_RE = /\b(?:tier|level|phase|part|class|type|stage|grade|section|chapter|appendix|division|unit|module|track|series|version|mark|model|gen|generation|henry|elizabeth|charles|james|louis|george|william|edward|richard|pope|world\s+war)\s+$/i;
const FIRST_PERSON_I_RE = /(?:^|[\s(,;])I(?=\s+(?:am|was|have|had|led|built|managed|created|developed|designed|worked|helped|assisted|coordinated|delivered|achieved|drove|oversaw|implemented|supported|collaborated|spearheaded|streamlined|reduced|increased|improved|ran|wrote|taught|treated|audited|analyzed|negotiated|will|can|bring|focus|specialize|believe|enjoy|love)\b|['’](?:m|ve|d|ll)\b)/g;
const PRESENT_RE = /\b(?:present|current|now|ongoing|expected|to\s+date)\b/i;

export function hasFirstPersonPronoun(text: string): boolean {
  if (FIRST_PERSON_MY_ME_RE.test(text)) return true;
  FIRST_PERSON_I_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FIRST_PERSON_I_RE.exec(text)) !== null) {
    const before = text.slice(0, match.index + match[0].length - 1);
    if (!ROMAN_PREFIX_RE.test(before)) return true;
  }
  return false;
}

export type DateStyleKind = 'month-year' | 'numeric' | 'year-only' | 'present' | 'other';

export function classifyEditorDateStyle(raw: string | undefined): DateStyleKind {
  const s = (raw ?? '').trim();
  if (!s) return 'other';
  if (PRESENT_RE.test(s)) return 'present';
  if (/^(?:19|20)\d{2}$/.test(s)) return 'year-only';
  if (
    /^(?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}$/.test(s) ||
    /^(?:19|20)\d{2}[/-](?:0?[1-9]|1[0-2])(?:[/-](?:0?[1-9]|[12]\d|3[01]))?$/.test(s)
  ) {
    return 'numeric';
  }
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2}$/i.test(s)) {
    return 'month-year';
  }
  return 'other';
}

function comparableYearMonth(raw: string | undefined): number | null {
  const s = (raw ?? '').trim();
  if (!s || PRESENT_RE.test(s)) return null;
  const yearMatch = s.match(/\b((?:19|20)\d{2})\b/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  const mWord = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i);
  if (mWord) return year * 100 + (months[mWord[1].toLowerCase()] ?? 1);
  const mNum =
    s.match(/^(0?[1-9]|1[0-2])[/-](?:19|20)\d{2}$/) ||
    s.match(/^(?:19|20)\d{2}[/-](0?[1-9]|1[0-2])(?:[/-](?:0?[1-9]|[12]\d|3[01]))?$/);
  if (mNum) return year * 100 + Number(mNum[1]);
  return year * 100;
}

export function isReversedEditorDateRange(start: string | undefined, end: string | undefined): boolean {
  const sVal = comparableYearMonth(start);
  const eVal = comparableYearMonth(end);
  if (sVal === null || eVal === null) return false;
  if (sVal % 100 === 0 || eVal % 100 === 0) {
    return Math.floor(sVal / 100) > Math.floor(eVal / 100);
  }
  return sVal > eVal;
}

export function collectProfileDateStyles(profile: CVProfile): { styles: Set<DateStyleKind>; dominant: DateStyleKind | null } {
  const counts = new Map<DateStyleKind, number>();
  const add = (raw: string | undefined) => {
    const kind = classifyEditorDateStyle(raw);
    if (kind === 'other' || kind === 'present') return;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  };
  for (const exp of profile.experience.data) {
    add(exp.startDate);
    add(exp.endDate);
  }
  for (const edu of profile.education.data) {
    add(edu.startDate);
    add(edu.endDate || edu.graduationDate);
  }
  let dominant: DateStyleKind | null = null;
  let maxCount = 0;
  for (const [kind, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominant = kind;
    }
  }
  return { styles: new Set(counts.keys()), dominant };
}

export function lintDateRange(
  start: string | undefined,
  end: string | undefined,
  profileStyles?: { styles: Set<DateStyleKind>; dominant: DateStyleKind | null },
): ReadabilityHint[] {
  const hints: ReadabilityHint[] = [];
  if (isReversedEditorDateRange(start, end)) {
    hints.push({
      id: 'reversed-dates',
      message: 'Start date is after end date — check the chronology.',
    });
  }
  if (profileStyles && profileStyles.styles.size > 1 && profileStyles.dominant) {
    const sKind = classifyEditorDateStyle(start);
    const eKind = classifyEditorDateStyle(end);
    const entryMismatched =
      (sKind !== 'other' && sKind !== 'present' && sKind !== profileStyles.dominant) ||
      (eKind !== 'other' && eKind !== 'present' && eKind !== profileStyles.dominant);
    if (entryMismatched) {
      const example =
        profileStyles.dominant === 'month-year'
          ? 'Jan 2024'
          : profileStyles.dominant === 'numeric'
            ? '01/2024'
            : '2024';
      hints.push({
        id: 'mixed-date-style',
        message: `Mixed date format — other entries use "${example}".`,
      });
    }
  }
  return hints;
}

function firstWordToken(text: string): string {
  const m = text.trim().match(/^([A-Za-z][A-Za-z-]{2,})(?![A-Za-z-])/);
  return m ? m[1] : '';
}

export function lintBullets(bullets: readonly BulletPoint[]): Map<string, ReadabilityHint[]> {
  const result = new Map<string, ReadabilityHint[]>();
  const seenOpeners = new Map<string, number>();

  for (const b of bullets) {
    const trimmed = b.text.trim();
    if (!trimmed) continue;
    const hints: ReadabilityHint[] = [];
    const words = trimmed.split(/\s+/).filter(Boolean).length;

    if (words > 32) {
      hints.push({
        id: 'long-bullet',
        message: `${words} words — aim for 12–25 words for faster scanning.`,
      });
    }
    if (PASSIVE_OPENER_RE.test(trimmed)) {
      hints.push({
        id: 'passive-opener',
        message: 'Starts with passive phrasing — lead with a direct action verb.',
      });
    }
    if (hasFirstPersonPronoun(trimmed)) {
      hints.push({
        id: 'first-person',
        message: 'Uses first-person pronouns — implied first person reads cleaner on CVs.',
      });
    }
    const rawOpener = firstWordToken(trimmed);
    const opener = rawOpener.toLowerCase();
    if (opener) {
      const seen = (seenOpeners.get(opener) ?? 0) + 1;
      seenOpeners.set(opener, seen);
      if (seen >= 3) {
        hints.push({
          id: 'repeated-opener',
          message: `Opening word "${rawOpener}" repeats 3+ times here — vary verbs for stronger scan.`,
        });
      }
    }

    if (hints.length) result.set(b.id, hints.slice(0, 2));
  }
  return result;
}

export function lintSummary(text: string): ReadabilityHint[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const hints: ReadabilityHint[] = [];
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  if (words > 75) {
    hints.push({
      id: 'long-summary',
      message: `${words} words — aim for 35–65 words (2–3 concise sentences).`,
    });
  }
  if (hasFirstPersonPronoun(trimmed)) {
    hints.push({
      id: 'first-person',
      message: 'Uses first-person pronouns — implied first person is standard on resumes.',
    });
  }
  return hints;
}
