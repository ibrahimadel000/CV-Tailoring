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

/** Salient literal terms in `text` that the combined `support` does not contain. */
export function unsupportedTerms(text: string, support: readonly string[], index: readonly Term[]): Term[] {
  const corpus = support.join('\n');
  const found = new Map<string, Term>();
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
      add(phrase.map(i => tokens[i].word).join(' '));
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
  return [...found.values()];
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
