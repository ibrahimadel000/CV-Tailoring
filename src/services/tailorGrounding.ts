// Conservative local checks, NOT a semantic/factual verifier. Unknown additions
// are left for human review rather than being silently inserted into a resume.
const normalize = (v: string) => v.normalize('NFKC').toLowerCase().replace(/[أإآ]/g, 'ا');
const tokens = (v: string) => normalize(v).match(/[\p{L}\p{N}]+(?:[+#][+#]?)?/gu) ?? [];
const families = [
  'build built building develop developed developing development engineered engineer engineering create created creating',
  'design designed designing', 'lead led leading managed manage managing',
  'improve improved improving improvement improvements enhance enhanced enhancing',
  'accelerate accelerated accelerating acceleration',
  'reduce reduced reducing reduction decrease decreased decreasing cut cutting',
  'streamline streamlined streamlining simplify simplified simplifying',
  'conduct conducted conducting deliver delivered delivering',
  'collaborate collaborated collaborating collaboration cooperative',
  'train trained training workshop workshops teach teaching explain explaining explanation explanations',
  'mentor mentored mentoring coach coached coaching',
  'technical technology technologies', 'document documented documenting documentation',
  'analyze analyzed analyzing analysis analytical',
  'automate automated automating automation', 'integrate integrated integrating integration',
  'organize organized organizing organization', 'architect architecture architectures architected',
  'system systems', 'application applications', 'workflow workflows', 'pipeline pipelines',
  'operation operations operational', 'team teams', 'client clients', 'developer developers',
  'solution solutions', 'problem problems', 'process processes processing',
  'requirement requirements', 'support supported supporting', 'maintain maintained maintaining',
  'create created creating', 'implement implemented implementing implementation',
];
const neutral = new Set(('a an the and or with in on of for to from as by at across within through into using use uses ' +
  'while both their its this that these those each all also including include includes such than then more ' +
  'work working experience experienced professional background skills skill knowledge focused focus ' +
  'technical software web product products engineering engineer developer hands on practical existing ' +
  'help helped helping enabling enable enabled ensure ensuring ensured ' +
  'في من الى على عن مع و او ضمن عبر خلال باستخدام مهارات خبرة').split(' '));
function vocabulary(context: string) {
  const set = new Set(tokens(context));
  for (const family of families) { const words = family.split(' '); if (words.some(w => set.has(w))) words.forEach(w => set.add(w)); }
  return set;
}
export function wordingIssue(before: string, after: string, context: string): string | undefined {
  if (/\b(?:applicable|relevant|transferable|suited)\s+to\b|\b(?:aligns?|aligned)\s+with\s+(?:this|the)\s+(?:role|job)|مناسب(?:ة)?\s+لهذه\s+الوظيفة/iu.test(after)) {
    return 'Job-fit commentary belongs in the review, not an achievement.';
  }
  if (/\b(?:no|not|never|without|limited|beginner)\b/i.test(before)) {
    const qualifiers = before.toLowerCase().match(/\b(?:no|not|never|without|limited|beginner)\b/g) ?? [];
    if (qualifiers.some(q => !new RegExp(`\\b${q}\\b`, 'i').test(after))) return 'A limitation or qualification was removed.';
  }
  const available = vocabulary(context);
  const added = [...new Set(tokens(after).filter(t => !/^\d/.test(t) && !available.has(t) && !neutral.has(t)))];
  if (added.length) return 'New wording is not supported by the cited source vocabulary or approved paraphrases.';
  return undefined;
}
// A skill listing supports a skills statement, not professional use of the skill.
// Check only explicit terms: this still cannot establish semantic entailment.
export function skillPracticeIssue(after: string, evidence: { label: string; text: string }[]): boolean {
  const skillTokens = new Set(evidence.filter(e => ['Skill','Certification','Education'].includes(e.label)).flatMap(e => tokens(e.text)));
  const practical = vocabulary(evidence.filter(e => ['Work achievement','Project achievement','Professional summary','User-confirmed account (not independently verified)'].includes(e.label)).map(e => e.text).join(' '));
  for (const sentence of after.split(/(?<=[.!?؛])\s+/u)) {
    if (!/\b(?:experience|experienced|practical|hands[ -]on|proficien(?:t|cy)|used|built|developed|developing|delivered|implemented|integrated|applied)\b/i.test(sentence)) continue;
    // "Technical skills include Applied AI" is not a claim of practical use.
    if (/^\s*(?:technical\s+)?(?:skills?|knowledge)\s+(?:include|includes|in|of|:)/i.test(sentence)) continue;
    if (tokens(sentence).some(t => skillTokens.has(t) && !neutral.has(t) && !practical.has(t))) return true;
  }
  return false;
}
