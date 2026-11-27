/**
 * Conservative LITERAL term and number coverage checks for generated passages.
 *
 * These are deterministic string checks, not semantic verification:
 * a term that appears in the cited support is not thereby proven true,
 * and an absent term only means the rewrite introduced salient wording the
 * cited source does not literally contain.
 */
export type Term = { label: string; normalized: string };

const normalized = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
const tokenCharacter = /[\p{L}\p{N}\p{M}_+#]/u;
// Tokens may carry internal technical joiners: Node.js, C++, C#, ASP.NET, CI/CD, REST-API.
const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}\p{M}_]*(?:[.+#/-][\p{L}\p{N}]+)*[+#]*/gu;
const SENTENCE_START = /[.!?…:;\n]\s+/u;

/** Grammatical function words whose capitalization carries no proper-noun meaning. */
const COMMON = new Set(('the a an and or but nor of to in on for with by at from as is are was were be been being this that these those it its ' +
  'into over under across per via while within through using used use uses do does did done have has had having not no nor so such than then thus ' +
  'we i you he she they them their our your my his her their ours yours mine who whom whose which what when where why how all any both each few more most ' +
  'other some only own same also very just should can could will would shall may might must').split(' '));

/** Neutral action verbs ignored when capitalized by sentence-initial position. */
const SENTENCE_START_VERBS = new Set(('built worked maintained developed created designed implemented managed delivered supported improved led ' +
  'engineered streamlined aligned conducted collaborated integrated coordinated facilitated established reduced accelerated organized ' +
  'automated documented optimized standardized trained partnered executed prepared analyzed resolved authored monitored tracked ' +
  'configured migrated deployed tested validated drafted produced shaped reviewed guided assisted contributed expanded strengthened ' +
  'transformed unified consolidated architected simplified modernized prioritized enabled drove ' +
  'scaled cut boosted launched shipped eliminated revamped overhauled pioneered championed ' +
  'rebuilt upgraded secured shortened slashed restructured orchestrated remediated sped ' +
  'refactored tuned hardened debugged instrumented provisioned containerized benchmarked rewrote redesigned ' +
  're-architected re-engineered enhanced refined increased raised lifted grew saved halved doubled lowered ' +
  'minimized maximized mitigated prevented protected fixed patched stabilized unblocked decoupled extracted ' +
  'indexed cached parallelized processed parsed generated rendered exposed connected synced synchronized ' +
  'modeled prototyped evaluated assessed investigated profiled diagnosed troubleshot audited enforced verified ' +
  'published presented mentored coached onboarded compiled curated cataloged ' +
  'co-developed co-built co-authored co-designed co-engineered co-implemented ' +
  'negotiated reconciled forecasted budgeted closed sourced recruited taught instructed advised counseled ' +
  'treated administered inspected procured scheduled booked promoted pitched retained converted filed ' +
  'complied mediated represented allocated balanced billed invoiced calculated disbursed reported ' +
  'prospected renewed upsold acquired cultivated exceeded surpassed segmented positioned targeted ' +
  'amplified nurtured activated branded triaged screened charted discharged dispensed rehabilitated ' +
  'dispatched routed fabricated assembled calibrated installed repaired surveyed hired interviewed ' +
  'lectured tutored graded enrolled educated').split(' '));

const WRITTEN_NUMBERS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15',
  sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
  thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90',
  hundred: '100', thousand: '1000',
};

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
  if (t.endsWith('y') && contains(corpus, t.slice(0, -1) + 'ies')) return true;
  if (t.endsWith('es') && contains(corpus, t.slice(0, -2))) return true;
  if (t.endsWith('s') && contains(corpus, t.slice(0, -1))) return true;
  if (!t.endsWith('s') && (contains(corpus, t + 's') || contains(corpus, t + 'es'))) return true;
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
  // 2. Detect consecutive capitalized names, excluding function words and sentence-initial words.
  // Never join a sentence-initial word into a 2-word proper phrase (e.g., "Automated MySQL").
  const tokens = [...text.matchAll(TOKEN)].map(m => ({ word: m[0], index: m.index ?? 0 }));
  const isCapitalized = (w: string) => /^\p{Lu}/u.test(w);
  const isSentenceInitial = (at: number, i: number) => at === 0 || i === 0 || /[.!?…:;\n]\s*$/.test(text.slice(0, at));
  const isIgnoredWord = (word: string, sentenceInitial: boolean) => {
    const key = normalized(word);
    return COMMON.has(key) || (sentenceInitial && SENTENCE_START_VERBS.has(key));
  };
  const phraseMembers = new Set<number>();
  let phrase: number[] = [];
  const flushPhrase = () => {
    if (phrase.length >= 2) {
      const words = phrase.map(i => tokens[i].word), label = words.join(' ');
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
    const sentenceInitial = isSentenceInitial(at, i);
    const eligible = isCapitalized(word) && !isIgnoredWord(word, sentenceInitial);
    if (!eligible || (phrase.length && (SENTENCE_START.test(gap) || /[,;()\[\]"“”—–]/u.test(gap)))) flushPhrase();
    if (eligible) phrase.push(i);
    previousEnd = at + word.length;
  }
  flushPhrase();
  // 3. Single salient tokens. Ordinary sentence-initial capitalization alone
  // is ambiguous; these checks remain signals, not semantic verification.
  for (const [i, { word, index: at }] of tokens.entries()) {
    const sentenceInitial = isSentenceInitial(at, i);
    if (phraseMembers.has(i) || /^\d+$/.test(word) || isIgnoredWord(word, sentenceInitial)) continue;
    const internal = /[.+#/]/.test(word.slice(1, -1)) || /[+#]$/.test(word);
    const acronym = (/^\p{Lu}[\p{Lu}\p{N}&]*$/u.test(word) && word.replace(/\P{Lu}/gu, '').length >= 2) || /^[A-Z]\d+[a-z]?$/.test(word);
    const camel = /^.\P{Lu}*\p{Lu}/u.test(word);
    const capitalizedWord = isCapitalized(word) && word.length >= 3 && !sentenceInitial;
    const slashPartsCovered = word.includes('/') && !/[.+#]/.test(word) && word.split('/').filter(Boolean).length >= 2 && word.split('/').filter(Boolean).every(part => part.length >= 2 && covered(corpus, part));
    const hyphenCompoundMatch = /^(.+)-(?:based|driven|backed|powered|hosted|native|first|centric|ready|compatible|focused|level|side|specific|related)$/i.exec(word);
    const hyphenCompoundCovered = Boolean(hyphenCompoundMatch && covered(corpus, hyphenCompoundMatch[1]));
    if (!slashPartsCovered && !hyphenCompoundCovered && ((internal && word.length >= 2) || acronym || camel || capitalizedWord)) add(word);
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
export function reorderedSourceEcho(text: string, candidates: readonly { id: string; text: string }[]): boolean {
  const words = new Set(editorialWords(text));
  if (words.size < 6) return false;
  return candidates.some(candidate => {
    const original = new Set(editorialWords(candidate.text));
    if (original.size < 6) return false;
    const shared = [...words].filter(word => original.has(word)).length;
    return shared >= 6 && shared / words.size >= 0.8 && shared / original.size >= 0.65;
  });
}
export function editorialNovelWords(text: string, facts: readonly string[]): string[] {
  const available = new Set(facts.flatMap(editorialWords));
  return [...new Set(editorialWords(text).filter(word => !available.has(word)))];
}
export function editorialOverlap(text: string, fact: string): number {
  const left = new Set(editorialWords(text)), right = new Set(editorialWords(fact));
  return [...left].filter(word => right.has(word)).length;
}

/**
 * Numeric quantities in `text` that never appear in `support` (including simple
 * written-out English numbers like "five" -> "5").
 */
export function unsupportedNumbers(text: string, support: readonly string[]): string[] {
  const NUMBER = /\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?/g;
  const joined = support.join(' ');
  const known = new Set((joined.match(NUMBER) || []).map(n => n.replace(/,/g, '')));
  for (const word of normalized(joined).match(/\b[a-z]+\b/g) || []) {
    if (WRITTEN_NUMBERS[word]) known.add(WRITTEN_NUMBERS[word]);
  }
  const found = new Set<string>();
  for (const match of text.matchAll(NUMBER)) {
    const digits = match[0].replace(/,/g, '');
    if (!known.has(digits)) found.add(match[0]);
  }
  return [...found];
}
