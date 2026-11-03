/**
 * Conservative LITERAL term and number coverage checks for generated passages.
 *
 * These are deterministic string checks, not semantic verification:
 * a term that appears in the cited support is not thereby proven true,
 * and an absent term only means the rewrite introduced salient wording the
 * cited source does not literally contain. Callers restore original wording
 * on failure, so false positives are safe (the candidate's own text returns)
 * and false negatives remain a documented editorial risk.
 */
export type Term = { label: string; normalized: string };

const normalized = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
const tokenCharacter = /[\p{L}\p{N}\p{M}_+#]/u;
// Tokens may carry internal technical joiners: Node.js, C++, C#, ASP.NET, CI/CD, REST-API.
const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}\p{M}_]*(?:[.+#/-][\p{L}\p{N}]+)*[+#]*/gu;
const SENTENCE_START = /[.!?…:;\n]\s+/u;

/** Function words whose capitalization at sentence start carries no meaning. */
const COMMON = new Set(('the a an and or but nor of to in on for with by at from as is are was were be been being this that these those it its ' +
  'into over under across per via while within through using used use uses do does did done have has had having not no nor so such than then thus ' +
  'we i you he she they them their our your my his her their ours yours mine who whom whose which what when where why how all any both each few more most ' +
  'other some only own same also very just should can could will would shall may might must built worked maintained developed created designed implemented managed delivered supported improved led').split(' '));

/** Word-boundary containment on normalized text, shared shape with the summary boundary. */
function contains(text: string, needle: string): boolean {
  const value = normalized(text), term = normalized(needle);
  if (!term) return false;
  for (let at = value.indexOf(term); at !== -1; at = value.indexOf(term, at + 1)) {
    const before = at === 0 ? '' : value[at - 1];
    const after = value[at + term.length] || '';
    if (!tokenCharacter.test(before) && !tokenCharacter.test(after)) return true;
  }
  return false;
}
/** Singular/plural-tolerant containment: "APIs" is supported by "API" and vice versa. */
function covered(corpus: string, term: string): boolean {
  const t = normalized(term);
  if (contains(corpus, t)) return true;
  if (t.endsWith('ies') && contains(corpus, t.slice(0, -3) + 'y')) return true;
  if (t.endsWith('s') && contains(corpus, t.slice(0, -1))) return true;
  if (!t.endsWith('s') && contains(corpus, t + 's')) return true;
  return false;
}

/**
 * Index of protected terms built from the candidate's own skill names.
 * Skill names stay checkable even where a generic token rule would skip them.
 */
export function buildTermIndex(names: readonly string[]): Term[] {
  const seen = new Set<string>(), index: Term[] = [];
  for (const name of names) {
    const label = name.trim(), key = normalized(label);
    if (key && !seen.has(key)) { seen.add(key); index.push({ label, normalized: key }); }
  }
  return index;
}

/** Literal signals only: separated words are not proof of a relationship. */
export function analyzeTerms(text: string, support: readonly string[], index: readonly Term[]) {
  const corpus = support.join('\n');
  const found = new Map<string, Term>(), splitPhrases: string[] = [];
  const add = (label: string) => {
    const key = normalized(label);
    if (key && !covered(corpus, label)) found.set(key, { label, normalized: key });
  };
  // 1. Protected skill names mentioned anywhere in the passage.
  for (const term of index) if (contains(text, term.normalized)) add(term.label);
  // 2. Detect consecutive capitalized names, excluding common words and verbs.
  // A single word in a phrase is not reported again as a separate invention.
  const tokens = [...text.matchAll(TOKEN)].map(m => ({ word: m[0], index: m.index ?? 0 }));
  const isCapitalized = (w: string) => /^\p{Lu}/u.test(w);
  const phraseMembers = new Set<number>();
  let phrase: number[] = [];
  const flushPhrase = () => {
    if (phrase.length >= 2) {
      const words = phrase.map(i => tokens[i].word), label = words.join(' ');
      // Permit only an exact whole-passage word-order reversal, keeping all
      // surrounding words and punctuation. Separate words or a different action,
      // actor, negation, or qualifier must not pass this narrow exception.
      const reversed = words.length === 2 && ['using', 'with', 'in'].some(connector => {
        const proposed = normalized(text).replace(normalized(label),
          `${normalized(words[1])} ${connector} ${normalized(words[0])}`);
        return support.some(source => normalized(source) === proposed);
      });
      if (!covered(corpus, label) && reversed) splitPhrases.push(label);
      else add(label);
      phrase.forEach(i => phraseMembers.add(i));
    }
    phrase = [];
  };
  let previousEnd = -1;
  for (const [i, { word, index: at }] of tokens.entries()) {
    const gap = previousEnd < 0 ? '' : text.slice(previousEnd, at);
    const eligible = isCapitalized(word) && !COMMON.has(normalized(word));
    if (!eligible || (phrase.length && (SENTENCE_START.test(gap) || /[,;()\[\]"“”]/u.test(gap)))) flushPhrase();
    if (eligible) phrase.push(i);
    previousEnd = at + word.length;
  }
  flushPhrase();
  // 3. Single salient tokens. Ordinary sentence-initial capitalization alone
  // is ambiguous; these checks remain signals, not semantic verification.
  for (const [i, { word, index: at }] of tokens.entries()) {
    if (phraseMembers.has(i) || /^\d+$/.test(word) || COMMON.has(normalized(word))) continue;
    const internal = /[.+#/]/.test(word.slice(1, -1)) || /[+#]$/.test(word);
    const acronym = /^\p{Lu}[\p{Lu}\p{N}&]*$/u.test(word) && word.replace(/\P{Lu}/gu, '').length >= 2;
    const camel = /^.\P{Lu}*\p{Lu}/u.test(word);
    const sentenceInitial = at === 0 || i === 0 || /[.!?…]\s*$/.test(text.slice(0, at));
    const capitalizedWord = isCapitalized(word) && word.length >= 3 && !sentenceInitial;
    if ((internal && word.length >= 2) || acronym || camel || capitalizedWord) add(word);
  }
  return { unsupported: [...found.values()], splitPhrases };
}

/** Salient literal terms absent from their cited support. */
export function unsupportedTerms(text: string, support: readonly string[], index: readonly Term[]): Term[] {
  return analyzeTerms(text, support, index).unsupported;
}

const sequence = (text: string): string[] => normalized(text).match(TOKEN) ?? [];

/** Length of the longest common subsequence of two token lists (ordered overlap). */
function orderedOverlap(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      current[j] = a[i - 1] === b[j - 1]
        ? previous[j - 1] + 1
        : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous[b.length];
}

export type CopiedPassage = { id: string; shared: number };

/**
 * Detects text that substantially repeats ONE candidate passage in the same
 * word order instead of synthesizing across sources. A literal signal about
 * redundancy, not about truth: copying is always fully "supported" by its
 * source, so grounding checks can never catch it. Either most of the new
 * passage comes from one source passage, or most of a source passage was
 * carried over and it also dominates the new passage. A short contribution
 * embedded in a broader synthesis must not cause that synthesis to be removed.
 * Short passages and some embedded copies stay an editorial review matter.
 */
export function copiedPassage(text: string, candidates: readonly { id: string; text: string }[]): CopiedPassage | undefined {
  const mine = sequence(text);
  if (mine.length < 6) return undefined;
  let best: CopiedPassage | undefined;
  for (const candidate of candidates) {
    const theirs = sequence(candidate.text);
    if (theirs.length < 6) continue;
    const shared = orderedOverlap(mine, theirs);
    if (shared < 6) continue;
    if (shared / mine.length >= 0.8 || (shared / theirs.length >= 0.85 && shared / mine.length >= 0.6)) {
      if (!best || shared > best.shared) best = { id: candidate.id, shared };
    }
  }
  return best;
}

/** A narrow editorial signal, never a factual or semantic check. Regular English
 * inflections and common role framing are normalized to catch a shortened
 * sentence that mostly echoes one source contribution. Does not delete text. */
const ECHO_FRAME = new Set(('a an the and or in of for with to on as at by from through while '
  + 'software engineer experienc experience professional background focused focus specialist role combin').split(' '));
function editorialWords(text: string): string[] {
  return sequence(text).map(word => {
    if (/^[a-z]{5,}$/.test(word)) {
      if (/^improv(?:e|ed|ing|ement|ements)?$/.test(word)) return 'improv';
      if (word.endsWith('ing') && word.length > 6) return word.slice(0, -3);
      if (word.endsWith('ed') && word.length > 5) return word.slice(0, -2);
      if (word.endsWith('ies') && word.length > 5) return word.slice(0, -3) + 'y';
      if (word.endsWith('s') && !word.endsWith('ss') && word.length > 5) return word.slice(0, -1);
    }
    return word;
  }).filter(word => !ECHO_FRAME.has(word));
}
export function shortenedSourceEcho(text: string, candidates: readonly { id: string; text: string }[]): boolean {
  const words = editorialWords(text);
  if (words.length < 5) return false;
  return candidates.some(candidate => {
    const shared = orderedOverlap(words, editorialWords(candidate.text));
    return shared >= 5 && shared / words.length >= 0.8;
  });
}
/** Extra content words absent from cited facts. Conservative and incomplete;
 * it cannot establish the meaning, attribution or truth of a sentence. */
export function editorialNovelWords(text: string, facts: readonly string[]): string[] {
  const available = new Set(facts.flatMap(editorialWords));
  return [...new Set(editorialWords(text).filter(word => !available.has(word)))];
}
/** Literal token overlap for a cautious alternative-selection signal. */
export function editorialOverlap(text: string, fact: string): number {
  const left = new Set(editorialWords(text)), right = new Set(editorialWords(fact));
  return [...left].filter(word => right.has(word)).length;
}

/**
 * Numeric quantities in `text` that never appear in `support`, as written.
 * Digit sequences compare after thousand-separator removal. Written-out numbers
 * and the meaning of any figure stay an editorial review matter, not this
 * literal check.
 */
export function unsupportedNumbers(text: string, support: readonly string[]): string[] {
  const NUMBER = /\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?/g;
  const known = new Set((support.join(' ').match(NUMBER) || []).map(n => n.replace(/,/g, '')));
  const found = new Set<string>();
  for (const match of text.matchAll(NUMBER)) {
    const digits = match[0].replace(/,/g, '');
    if (!known.has(digits)) found.add(match[0]);
  }
  return [...found];
}
