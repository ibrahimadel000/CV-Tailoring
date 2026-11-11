/** Conservative literal job-token coverage for existing skills only.
 * This is not a relevance, proficiency, or factuality classifier. The optional
 * safeguard retains an existing uniquely identified native skill when a clear
 * acronym/mixed-case technology token, a narrowly matched two-word phrase,
 * an exact Python/Java label in explicit programming context, or an exact native
 * label in a narrowly formatted required-skills list appears without negation.
 * Mixed-script mentions suppress retention because negation is not multilingual.
 * It never creates a skill or changes its native name, level, or qualification.
 */
import type { CVProfile } from '@/types/schema';
import type { Source } from '../contentEngine/engine';
import { equivalentSkillKey } from './documentEditorial';

type Selection = { id: string; category: 'Technical' | 'Tools' | 'Soft' | 'Languages' };
type Addition = { id: string; name: string; token: string; category: Selection['category'] };
const TOKEN = /[A-Za-z][A-Za-z0-9+#]*/g;
// Treat only these exact native labels as distinctive. Do not infer that a
// match for C++ justifies selecting a longer combined skill label.
const SYMBOL_LANGUAGES = new Set(['c++', 'c#', 'f#']);
// Ordinary words can have other meanings. Only these exact native labels get
// this extra match, and only with an explicit programming context below.
const CONTEXT_LANGUAGES = new Set(['python', 'java']);
// Broad organizational/legal words are not technology-specific signals.
const EXCLUDE = new Set(['AND','THE','FOR','WITH','FROM','YOU','YOUR','ALL','ANY','NOT','YES','OUR','JOB','CV','USA','USD','UK','EU','EEO','CEO','CTO','HR']);
const AMBIGUOUS_LINE = /\b(?:no|not|never|without|avoid|exclude|excluded|unnecessary|irrelevant|optional|neither|nor|rather than|not required|no longer|isn['’]t|aren['’]t|don['’]t|doesn['’]t|can['’]t|shouldn['’]t|unrelated|nonessential|non-essential|lack|lacks|lacking)\b/i;
const lower = (s: string) => s.toLowerCase();
// Exact adjacent words only; avoid matching generic qualifications or filler.
// This is deliberately not a skill taxonomy or a semantic similarity check.
const GENERIC = new Set(['strong','good','excellent','basic','advanced','skills','skill','ability','abilities','knowledge','experience','experienced','required','preferred','familiar','familiarity','working','team','teams','work']);
function distinctivePhrases(text: string): string[] {
 const value = text.normalize('NFKC');
 const words = [...value.matchAll(/[\p{L}\p{M}]{4,}/gu)];
 const phrases: string[] = [];
 for (let i = 0; i + 1 < words.length; i++) {
  const left = words[i], right = words[i + 1];
  const separator = value.slice(left.index! + left[0].length, right.index!);
  const a = lower(left[0]), b = lower(right[0]);
  // The negation rules above are English-only. Decline non-English phrases
  // rather than silently misinterpreting a requirement in another language.
  if (/^[a-z]+$/.test(a) && /^[a-z]+$/.test(b)
      && /^[\s\-\u2010-\u2015]+$/u.test(separator) && !GENERIC.has(a) && !GENERIC.has(b))
   phrases.push(`${a} ${b}`);
 }
 return [...new Set(phrases)];
}
function distinctiveTokens(text: string) {
 const exactSymbol = SYMBOL_LANGUAGES.has(lower(text.trim()));
 return [...new Set((text.match(TOKEN) || []).filter(t =>
  (exactSymbol && lower(t) === lower(text.trim())) ||
  (t.length >= 3 && (t.match(/[A-Z]/g) || []).length >= 2 && !EXCLUDE.has(t.toUpperCase()))
 ).map(lower))];
}
// This checks a few local English constructions, not intent, relevance or
// proficiency. Do not infer the meaning of a combined native skill label.
function programmingContext(line: string, name: string): boolean {
 const term = `(?<![\\p{L}\\p{N}_+.#-])${name}(?![\\p{L}\\p{N}_+#-]|\\.[\\p{L}\\p{N}])`;
 const after = `${term}\\s+(?:software\\s+)?(?:programming|development|coding|developers?|engineers?)\\b`;
 const before = `\\b(?:programming|coding|software(?:\\s+development)?|developing)\\s+(?:in|using|with)\\s+${term}`;
 return new RegExp(`${after}|${before}`, 'iu').test(line);
}
// A conservative list parser, not a job-understanding model. Only explicit
// English required/essential/mandatory skills headers and plain comma or
// contiguous bullet lists are supported. Preserve native labels and levels.
const extraAmbiguity = /\b(?:excluding|except|excepting|prohibited|forbidden|banned|disallowed|unwanted|unneeded)\b/i;
const nonEnglishLetters = (text: string) => /[^\x00-\x7F]/u.test(text) && [...text].some(ch => /\p{L}/u.test(ch) && !/[A-Za-z]/u.test(ch));
const normalizedExactLabel = (text: string) => text.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
function usableExactLabel(text: string): string | undefined {
 const value = normalizedExactLabel(text);
 return /^[a-z0-9.+#][a-z0-9 .+#&/()-]{0,99}$/u.test(value) ? value : undefined;
}
function requiredSkillItems(job: string): Set<string> {
 const result = new Set<string>();
 let collecting = false;
 const add = (line: string) => {
  if (AMBIGUOUS_LINE.test(line) || extraAmbiguity.test(line) || nonEnglishLetters(line)) return;
  for (const item of line.split(',')) {
   const value = usableExactLabel(item.trim().replace(/\.$/u, ''));
   if (value) result.add(value);
  }
 };
 for (const raw of job.split(/\r?\n/u)) {
  const line = raw.trim();
  if (!line) { collecting = false; continue; }
  const header = /^(?:[-*•]\s*)?(?:required|essential|mandatory)\s+skills?\s*:\s*(.*)$/iu.exec(line);
  if (header) { collecting = !header[1].trim(); if (!collecting) add(header[1]); continue; }
  if (collecting) {
   const bullet = /^[-*•]\s+(.+)$/u.exec(line);
   if (bullet) { add(bullet[1]); continue; }
   collecting = false;
  }
 }
 return result;
}
// Block explicit same-label contradictions or mixed-language mentions anywhere
// in the job. This can miss other phrasings and can suppress valid matches.
function conflictingRequiredLabels(jobLines: readonly string[], labels: Iterable<string>): Set<string> {
 const ambiguous = jobLines.filter(line => AMBIGUOUS_LINE.test(line) || extraAmbiguity.test(line)
   || /\bnon-/i.test(line) || nonEnglishLetters(line));
 const blocked = new Set<string>();
 for (const name of labels) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  const exact = new RegExp(`(?<![\\p{L}\\p{N}_+.#])${escaped}(?![\\p{L}\\p{N}_+#-]|\\.[\\p{L}\\p{N}])`, 'iu');
  if (ambiguous.some(line => exact.test(line.normalize('NFKC')))) blocked.add(name);
 }
 return blocked;
}
export function explicitSkillCoverage(profile: CVProfile, source: Source, job: string, selected: readonly Selection[]): Addition[] {
 if (source.locks.skills || !job.trim()) return [];
 const already = new Set(selected.map(s => s.id));
 const alreadyEquiv = new Set(selected.filter(s => source.skillIds.includes(s.id)).map(s => equivalentSkillKey(source, s.id)));
 const skills = source.skillIds.flatMap(id => {
  const index = /^skill_(\d+)$/.exec(id);
  const native = index ? profile.skills.data[Number(index[1]) - 1] : undefined;
  const language = native && CONTEXT_LANGUAGES.has(lower(native.name.trim())) ? lower(native.name.trim()) : undefined;
  return native ? [{ id, equivKey: equivalentSkillKey(source, id), native, tokens: distinctiveTokens(native.name), phrases: distinctivePhrases(native.name), language, exact: usableExactLabel(native.name) }] : [];
 });
 // Key ownership by equivalentSkillKey so exact duplicate records across groups
 // do not self-collide, while genuinely distinct skills sharing a token still do.
 const owners = new Map<string, Set<string>>();
 for (const skill of skills) for (const token of [...skill.tokens.map(t => `t:${t}`), ...skill.phrases.map(p => `p:${p}`), ...(skill.language ? [`l:${skill.language}`] : []), ...(skill.exact ? [`e:${skill.exact}`] : [])]) {
  const s = owners.get(token) || new Set<string>(); s.add(skill.equivKey); owners.set(token, s);
 }
 // Delimiters keep a negative requirement from influencing neighboring lines.
 // A negative/ambiguous mention anywhere suppresses that token entirely.
 const lines = job.split(/[\n;!?]+/u).map(s => s.trim()).filter(Boolean);
 const positive = new Set<string>(), negative = new Set<string>();
 const requiredItems = requiredSkillItems(job);
 const blockedRequired = conflictingRequiredLabels(lines, skills.flatMap(s => s.exact && requiredItems.has(s.exact) ? [s.exact] : []));
 for (const item of requiredItems) if (!blockedRequired.has(item)) positive.add(`e:${item}`);
 for (const line of lines) {
  // Negation recognition is English-only. A line containing non-ASCII
  // letters can qualify or negate ANY English token or phrase, not only C++.
  // Suppress all of its matches, including a separate positive mention of the
  // same skill; this can decline valid bilingual mentions rather than infer fit.
  const nonEnglishScript = nonEnglishLetters(line);
  const isAmbiguous = AMBIGUOUS_LINE.test(line) || nonEnglishScript;
  const languageAmbiguous = isAmbiguous || extraAmbiguity.test(line);
  const terms = isAmbiguous ? negative : positive;
  for (const match of line.matchAll(TOKEN)) {
   const token = lower(match[0]);
   // Objective-C++ is a distinct language, not an exact mention of C++.
   if (token === 'c++' && /\bobjective-$/i.test(line.slice(0, match.index))) continue;
   terms.add(`t:${token}`);
   // Any negative or mixed-script mention suppresses contextual recovery,
   // even if that line lacks an explicit programming phrase.
   if (CONTEXT_LANGUAGES.has(token) && (languageAmbiguous || /(?:^|\W)non-$/i.test(line.slice(0, match.index)))) negative.add(`l:${token}`);
  }
  for (const phrase of distinctivePhrases(line)) terms.add(`p:${phrase}`);
  if (!languageAmbiguous)
   for (const language of CONTEXT_LANGUAGES) if (programmingContext(line, language)) positive.add(`l:${language}`);
 }
 const matched = (key: string) => owners.get(key)?.size === 1 && positive.has(key) && !negative.has(key);
 const added: Addition[] = [];
 for (const skill of skills) {
  if (already.has(skill.id) || alreadyEquiv.has(skill.equivKey)) continue;
  // An all-caps native label may also match the older acronym rule. Do not
  // let that bypass a contradictory mention found for this exact language.
  if (skill.language && negative.has(`l:${skill.language}`)) continue;
  if (skill.exact && blockedRequired.has(skill.exact)) continue;
  const token = skill.tokens.find(t => matched(`t:${t}`));
  const phrase = skill.phrases.find(p => matched(`p:${p}`));
  const language = skill.language && matched(`l:${skill.language}`) ? skill.language : undefined;
  const required = skill.exact && matched(`e:${skill.exact}`) ? skill.exact : undefined;
  const match = token || phrase || language || required;
  if (!match) continue;
  alreadyEquiv.add(skill.equivKey);
  added.push({ id: skill.id, name: skill.native.name, token: match, category: skill.native.category });
 }
 return added;
}
