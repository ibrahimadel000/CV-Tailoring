/** Conservative literal job-token coverage for existing skills only.
 * This is not a relevance, proficiency, or factuality classifier. The optional
 * safeguard retains an existing uniquely identified native skill when a clear
 * acronym/mixed-case technology token or a narrowly matched two-word phrase
 * appears in the job without negation.
 * It never creates a skill or changes its native name, level, or qualification.
 */
import type { CVProfile } from '@/types/schema';
import type { Source } from '../contentEngine/engine';
import { equivalentSkillKey } from './documentEditorial';

type Selection = { id: string; category: 'Technical' | 'Tools' | 'Soft' | 'Languages' };
type Addition = { id: string; name: string; token: string; category: Selection['category'] };
const TOKEN = /[A-Za-z][A-Za-z0-9+#]*/g;
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
 return [...new Set((text.match(TOKEN) || []).filter(t => ((t.length >= 3 && (t.match(/[A-Z]/g) || []).length >= 2) || /^[A-Za-z][A-Za-z0-9]*[+#]+$/.test(t)) && !EXCLUDE.has(t.toUpperCase())).map(lower))];
}
export function explicitSkillCoverage(profile: CVProfile, source: Source, job: string, selected: readonly Selection[]): Addition[] {
 if (source.locks.skills || !job.trim()) return [];
 const already = new Set(selected.map(s => s.id));
 const alreadyEquiv = new Set(selected.filter(s => source.skillIds.includes(s.id)).map(s => equivalentSkillKey(source, s.id)));
 const skills = source.skillIds.flatMap(id => {
  const index = /^skill_(\d+)$/.exec(id);
  const native = index ? profile.skills.data[Number(index[1]) - 1] : undefined;
  return native ? [{ id, equivKey: equivalentSkillKey(source, id), native, tokens: distinctiveTokens(native.name), phrases: distinctivePhrases(native.name) }] : [];
 });
 // Key ownership by equivalentSkillKey so exact duplicate records across groups
 // do not self-collide, while genuinely distinct skills sharing a token still do.
 const owners = new Map<string, Set<string>>();
 for (const skill of skills) for (const token of [...skill.tokens.map(t => `t:${t}`), ...skill.phrases.map(p => `p:${p}`)]) {
  const s = owners.get(token) || new Set<string>(); s.add(skill.equivKey); owners.set(token, s);
 }
 // Delimiters keep a negative requirement from influencing neighboring lines.
 // A negative/ambiguous mention anywhere suppresses that token entirely.
 const lines = job.split(/[\n;!?]+/u).map(s => s.trim()).filter(Boolean);
 const positive = new Set<string>(), negative = new Set<string>();
 for (const line of lines) {
  const terms = AMBIGUOUS_LINE.test(line) ? negative : positive;
  for (const token of line.match(TOKEN) || []) terms.add(`t:${lower(token)}`);
  for (const phrase of distinctivePhrases(line)) terms.add(`p:${phrase}`);
 }
 const matched = (key: string) => owners.get(key)?.size === 1 && positive.has(key) && !negative.has(key);
 const added: Addition[] = [];
 for (const skill of skills) {
  if (already.has(skill.id) || alreadyEquiv.has(skill.equivKey)) continue;
  const token = skill.tokens.find(t => matched(`t:${t}`));
  const phrase = skill.phrases.find(p => matched(`p:${p}`));
  const match = token || phrase;
  if (!match) continue;
  alreadyEquiv.add(skill.equivKey);
  added.push({ id: skill.id, name: skill.native.name, token: match, category: skill.native.category });
 }
 return added;
}
