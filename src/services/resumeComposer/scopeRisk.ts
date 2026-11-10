/**
 * Narrow English-language warning signals for changed AI prose. These are
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

function hasNegation(text: string): boolean {
  // “Not only X but also Y” is a positive idiom, not a qualification.
  return NEGATION.test(text.replace(/\bnot\s+only\b/gu, '')) || /\bnon[-\s]+production\b/u.test(text);
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