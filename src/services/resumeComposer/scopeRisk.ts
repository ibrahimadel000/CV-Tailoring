/**
 * Narrow literal warning signals for changed AI prose, mainly in English. These are
 * conservative literal checks, not a semantic, factual or safety verifier.
 * They can reject supported paraphrases and miss unsupported implications,
 * scope reversals and claims expressed in other languages.
 */

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[’]/g, "'");
const NEGATION = /\b(?:no|not|never|without|cannot|can't|couldn't|didn't|doesn't|don't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|won't|wouldn't)\b/u;
const LEADERSHIP = /\b(?:led|lead|leads|leading|managed|manages|managing|directed|directs|directing|headed|heading|supervised|supervises|supervising)\b/u;
// Exclude the ambiguous noun 'lead' (for example, lead time).
const ASSERTED_LEADERSHIP = /\b(?:led|leading|managed|managing|directed|directing|headed|heading|supervised|supervising)\b/u;
const PEOPLE = /\b(?:team|teams|staff|employees|engineers|developers|workers|personnel|people|colleagues)\b/u;
const EXTERNAL_AUDIENCE = /\bexternal\s+(?:users?|clients?|customers?|partners?|audiences?)\b/u;
const PRODUCTION = /\b(?:production|live\s+environment)\b/u;
// These literal markers can catch missing qualifications, but cannot
// determine which action a qualifier applies to or establish equivalence.
const LIMITED_PARTICIPATION = /\b(?:assist(?:ed|ing)?|help(?:ed|ing)?|contribut(?:ed|ing)\s+to)\b/u;
const PARTICIPATION_WORDING = /\b(?:assist(?:ed|ing)?|help(?:ed|ing)?|contribut(?:ed|ing)\s+to|support(?:ed|ing)?|participat(?:ed|ing))\b/u;
const CLASSROOM = /\b(?:classroom|class\s+(?:project|exercise|assignment))\b/u;
const COURSEWORK = /\b(?:coursework|course\s+(?:project|exercise|assignment))\b/u;
const PROTOTYPE = /\b(?:prototype|proof[-\s]+of[-\s]+concept)\b/u;
// Deliberately narrow: explicit supervision versus an explicit claim of
// independence. These words do not establish which task they modify.
const SUPERVISED = /\b(?:under (?:direct )?supervision|under (?:the )?guidance|supervised by)\b/u;
const INDEPENDENT = /\b(?:independently|without supervision|unsupervised)\b/u;

// Narrow verb + infinitive forms only. This does not identify completion,
// understand tense or relationships, or cover other languages and synonyms.
function plannedActions(text: string): string[] {
  // "Planning to ..." can also be a noun phrase, as in "cross-team planning
  // to align schedules". Exclude it rather than undo established planning work.
  const pattern = /\b(?:plan(?:s|ned)?|intend(?:s|ed|ing)?|aim(?:s|ed|ing)?|expect(?:s|ed|ing)?|schedul(?:e|es|ed|ing))\s+to\s+(?:[a-z]+ly\s+)?([a-z]+)\b/gu;
  return [...text.matchAll(pattern)].map(match => match[1]);
}

// Small Arabic signals only: standalone لم، لن، لا، ليس، ليست، دون، بدون,
// optionally joined to و/ف. Strip common diacritics/tatweel for matching; never
// alter published text. These are not grammatical or semantic analysis.
function arabicNegationText(text: string): string {
  return text.replace(/[\u064b-\u065f\u0670\u0640]/gu, '')
    .replace(/(^|[^\p{L}\p{N}_])(?:و|ف)?(?:ليس|ليست)\s+فقط(?=$|[^\p{L}\p{N}_])/gu, '$1')
    .replace(/(^|[^\p{L}\p{N}_])(?:و|ف)?لا\s+(?:سيما|يزال|تزال|زال|بد|شك|بأس|غنى)(?=$|[^\p{L}\p{N}_])/gu, '$1');
}
function hasArabicNegation(text: string): boolean {
  return /(?:^|[^\p{L}\p{N}_])(?:و|ف)?(?:لم|لن|لا|ليس|ليست|دون|بدون)(?=$|[^\p{L}\p{N}_])/u.test(arabicNegationText(text));
}
function hasNegation(text: string): boolean {
  // “Not only X but also Y” and “ليس فقط” are positive idioms.
  return NEGATION.test(text.replace(/\bnot\s+only\b/gu, '')) || /\bnon[-\s]+production\b/u.test(text) || hasArabicNegation(text);
}
// Compare literal Arabic forms only after لم/لن/لا. Different inflections,
// synonyms, objects, negation patterns and cross-language relations require
// human review. Including the particle avoids conflating past and future.
function arabicNegativeActions(text: string): string[] {
  const pattern = /(?:^|[^\p{L}\p{N}_])(?:و|ف)?(لم|لن|لا)\s+([\p{Script=Arabic}]+)/gu;
  return [...arabicNegationText(text).matchAll(pattern)].map(m => m[1] + ' ' + m[2]);
}
// A small literal signal for common English negative-action constructions.
// It does not parse grammar, objects, actors or qualifiers, and can restore a
// faithful paraphrase when the model uses a synonym. It is not a semantic guard.
function negativeActionRoots(text: string): string[] {
  const roots: string[] = [];
  const pattern = /\b(?:not(?!\s+only\b)|never|without|cannot|can't|couldn't|didn't|doesn't|don't|won't|wouldn't)\s+(?:[a-z]+ly\s+)?([a-z]+)\b/gu;
  for (const match of text.matchAll(pattern)) {
    let word = match[1];
    if (word.endsWith('ing') && word.length > 5) word = word.slice(0, -3);
    else if (word.endsWith('ed') && word.length > 4) word = word.slice(0, -2);
    if (word.endsWith('e') && word.length > 3) word = word.slice(0, -1);
    roots.push(word);
  }
  return roots;
}

// Exact English "from X to Y" and Arabic "من X إلى Y" numeric endpoints
// only, including ASCII, Arabic-Indic and Eastern Arabic-Indic digits. This
// cannot understand measurement, units, causation or meaning. If both directions
// are cited, the relationship is ambiguous and neither direction is judged.
function numericRanges(text: string): [string, string][] {
  const digit = String.raw`[0-9٠-٩۰-۹]`;
  const number = String.raw`(?:${digit}{1,3}(?:[,٬]${digit}{3})+|${digit}+)(?:[.٫]${digit}+)?`;
  const signedNumber = String.raw`[+\-−]?${number}`;
  const unit = String.raw`(?:\s*[%٪]|\s+[\p{L}\p{M}]+)?`;
  const end = String.raw`(?!${digit}|[.,٬٫]${digit})`;
  const english = new RegExp(String.raw`\bfrom\s+[$€£]?\s*(${signedNumber})${unit}\s+to\s+[$€£]?\s*(${signedNumber})${end}`, 'gu');
  const arabic = new RegExp(String.raw`(?:^|[^\p{L}\p{N}_])من\s+[$€£]?\s*(${signedNumber})${unit}\s+(?:إلى|الى)\s+[$€£]?\s*(${signedNumber})${end}`, 'gu');
  const canonical = (value: string) => value.replace(/[٠-٩۰-۹]/gu, char => {
    const code = char.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  }).replace(/[,٬]/gu, '').replace(/٫/gu, '.').replace(/^\+/, '').replace(/^−/, '-').replace(/^-0(?:\.0+)?$/, '0');
  return [english, arabic].flatMap(pattern => [...text.matchAll(pattern)].map(m => [canonical(m[1]), canonical(m[2])] as [string, string]));
}
function reversesNumericRange(text: string, sources: readonly string[]): boolean {
  const original = sources.flatMap(numericRanges);
  return numericRanges(text).some(([a, b]) => a !== b
    && original.some(([x, y]) => x === b && y === a)
    && !original.some(([x, y]) => x === a && y === b));
}

// Literal sign comparison only. Recognize a directly attached +, - or Unicode
// minus on standalone numeric tokens (including currency prefixes); do not
// interpret hyphens within words or digit ranges as negative signs. A cited
// magnitude with both signs is ambiguous. This does not associate a number with
// its object or establish that a metric is true; unsupported forms need review.
function signedNumbers(text: string): [string, boolean][] {
  const pattern = /(?<![\p{L}\p{N}_.,٬٫+\-−])(?:[$€£]\s*)?([+\-−]?)(?:[$€£]\s*)?((?:[0-9٠-٩۰-۹]{1,3}(?:[,٬][0-9٠-٩۰-۹]{3})+|[0-9٠-٩۰-۹]+)(?:[.٫][0-9٠-٩۰-۹]+)?)(?![\p{L}\p{N}_]|[.,٬٫][0-9٠-٩۰-۹])/gu;
  return [...text.matchAll(pattern)].map(m => {
    const value = m[2].replace(/[٠-٩۰-۹]/gu, char => {
      const code = char.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    }).replace(/[,٬]/gu, '').replace(/٫/gu, '.');
    return [value, /^0+(?:\.0+)?$/u.test(value) ? false : m[1] === '-' || m[1] === '−'];
  });
}
function changesNumericSign(text: string, sources: readonly string[]): boolean {
  const original = sources.flatMap(signedNumbers);
  return signedNumbers(text).some(([value, negative]) => original.some(([v]) => v === value)
    && !original.some(([v, n]) => v === value && n === negative));
}

// Compare only a small set of explicit units attached to the same written
// number. This cannot associate figures with measurements, check conversions,
// or catch omitted units, unlisted units, or changed values. Shared numbers
// across multiple claims can cause conservative restoration.
function measuredUnits(text: string): [string, string][] {
  const clean = text.replace(/[\u064b-\u065f\u0670\u0640]/gu, '');
  const pattern = /(?<![\p{L}\p{N}_.,٬٫])((?:[0-9٠-٩۰-۹]{1,3}(?:[,٬][0-9٠-٩۰-۹]{3})+|[0-9٠-٩۰-۹]+)(?:[.٫][0-9٠-٩۰-۹]+)?)(?:\s*([%٪])|\s+(percentage\s+points?|percent\s+points?|percent(?:age)?|milliseconds?|ms|seconds?|minutes?|hours?|days?|weeks?|months?|years?|ثانية|ثواني|ثوان|دقيقة|دقائق|ساعة|ساعات|يوم|أيام|ايام|أسبوع|اسبوع|أسابيع|اسابيع|شهر|أشهر|اشهر|شهور|سنة|سنوات|عام|أعوام|اعوام))(?=$|[^\p{L}\p{N}_])/gu;
  const aliases: Record<string, string> = {
    '%':'percent', '٪':'percent', percent:'percent', percentage:'percent',
    'percentage point':'percentage-point', 'percentage points':'percentage-point', 'percent point':'percentage-point', 'percent points':'percentage-point',
    millisecond:'millisecond', milliseconds:'millisecond', ms:'millisecond',
    second:'second', seconds:'second', 'ثانية':'second', 'ثواني':'second', 'ثوان':'second',
    minute:'minute', minutes:'minute', 'دقيقة':'minute', 'دقائق':'minute',
    hour:'hour', hours:'hour', 'ساعة':'hour', 'ساعات':'hour',
    day:'day', days:'day', 'يوم':'day', 'أيام':'day', 'ايام':'day',
    week:'week', weeks:'week', 'أسبوع':'week', 'اسبوع':'week', 'أسابيع':'week', 'اسابيع':'week',
    month:'month', months:'month', 'شهر':'month', 'أشهر':'month', 'اشهر':'month', 'شهور':'month',
    year:'year', years:'year', 'سنة':'year', 'سنوات':'year', 'عام':'year', 'أعوام':'year', 'اعوام':'year',
  };
  return [...clean.matchAll(pattern)].map(m => {
    const value = m[1].replace(/[٠-٩۰-۹]/gu, char => {
      const code = char.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    }).replace(/[,٬]/gu, '').replace(/٫/gu, '.');
    const unit = (m[2] || m[3]).replace(/\s+/gu, ' ');
    return [value, aliases[unit]];
  });
}
function changesMeasuredUnit(text: string, sources: readonly string[]): boolean {
  const original = sources.flatMap(measuredUnits);
  return measuredUnits(text).some(([value, unit]) => original.some(([v]) => v === value)
    && !original.some(([v, u]) => v === value && u === unit));
}

function leadPeopleInOneClause(text: string): boolean {
  return text.split(/[.!?;\n]+/u).some(clause => LEADERSHIP.test(clause) && PEOPLE.test(clause));
}

export function scopeRisk(text: string, support: readonly string[]): string[] {
  const proposed = normalize(text), sources = support.map(normalize);
  if (sources.some(source => source.trim() === proposed.trim())) return [];
  const risks: string[] = [];
  if (sources.some(hasNegation) && !hasNegation(proposed))
    risks.push('a limitation in the cited wording may have been lost');
  if (hasNegation(proposed) && !sources.some(hasNegation))
    risks.push('a negative statement was not clearly stated in the cited wording');
  const sourceNegativeActions = sources.flatMap(negativeActionRoots), proposedNegativeActions = negativeActionRoots(proposed);
  if (sourceNegativeActions.length && proposedNegativeActions.length &&
      (sourceNegativeActions.some(root => !proposedNegativeActions.includes(root)) ||
       proposedNegativeActions.some(root => !sourceNegativeActions.includes(root))))
    risks.push('the action associated with a negation may have changed');
  const sourceArabicActions = sources.flatMap(arabicNegativeActions), proposedArabicActions = arabicNegativeActions(proposed);
  if (sourceArabicActions.length && proposedArabicActions.length &&
      (sourceArabicActions.some(action => !proposedArabicActions.includes(action)) ||
       proposedArabicActions.some(action => !sourceArabicActions.includes(action))))
    risks.push('the action or tense associated with an Arabic negation may have changed');
  if (reversesNumericRange(proposed, sources))
    risks.push('the direction of a numeric range may have changed');
  if (changesNumericSign(proposed, sources))
    risks.push('the sign associated with a numeric value may have changed');
  if (changesMeasuredUnit(proposed, sources))
    risks.push('the unit associated with a numeric value may have changed');
  const sourcePlans = sources.flatMap(plannedActions), proposedPlans = plannedActions(proposed);
  if (sourcePlans.length && !proposedPlans.length)
    risks.push('a planned or intended action may have been presented as completed');
  else if (!sourcePlans.length && proposedPlans.length)
    risks.push('a planned or intended action was not clearly stated in the cited wording');
  else if (sourcePlans.length && proposedPlans.length &&
      (sourcePlans.some(action => !proposedPlans.includes(action)) ||
       proposedPlans.some(action => !sourcePlans.includes(action))))
    risks.push('the planned or intended action may have changed');
  if (sources.some(source => LIMITED_PARTICIPATION.test(source)) && ASSERTED_LEADERSHIP.test(proposed)
      && !sources.some(source => LEADERSHIP.test(source)))
    risks.push('leadership was not clearly stated in the cited supporting role');
  if (leadPeopleInOneClause(proposed) && !sources.some(leadPeopleInOneClause))
    risks.push('team leadership was not clearly stated in the cited wording');
  if (EXTERNAL_AUDIENCE.test(proposed) && !sources.some(source => EXTERNAL_AUDIENCE.test(source)))
    risks.push('the external audience was not clearly stated in the cited wording');
  if (PRODUCTION.test(proposed) && !sources.some(source => PRODUCTION.test(source)))
    risks.push('the production setting was not clearly stated in the cited wording');
  if (sources.some(source => LIMITED_PARTICIPATION.test(source)) && !PARTICIPATION_WORDING.test(proposed))
    risks.push('the cited wording describes a supporting role that may have been lost');
  if (sources.some(source => CLASSROOM.test(source)) && !CLASSROOM.test(proposed))
    risks.push('a classroom qualification may have been lost');
  if (sources.some(source => COURSEWORK.test(source)) && !COURSEWORK.test(proposed))
    risks.push('a coursework qualification may have been lost');
  if (sources.some(source => PROTOTYPE.test(source)) && !PROTOTYPE.test(proposed))
    risks.push('a prototype qualification may have been lost');
  if (INDEPENDENT.test(proposed) && sources.some(source => SUPERVISED.test(source))
      && !sources.some(source => INDEPENDENT.test(source)))
    risks.push('independent work may conflict with the cited supervision wording');
  else if (sources.some(source => SUPERVISED.test(source)) && !SUPERVISED.test(proposed))
    risks.push('a supervision qualification may have been lost');
  return risks;
}