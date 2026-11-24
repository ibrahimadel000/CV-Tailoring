/**
 * Narrow English-language warning signals for changed AI prose. These are
 * conservative literal checks, not a semantic, factual or safety verifier.
 */

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[’]/g, "'");
const NEGATION = /\b(?:no|not|never|without|cannot|can't|couldn't|didn't|doesn't|don't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|won't|wouldn't)\b/u;
// Match direct people-management claims ("managed a team", "led the team", "supervised staff", "direct reports"),
// without false-positiving on work/process management across teams ("managed business operations across cross-functional teams").
const PEOPLE_MANAGEMENT = /\b(?:(?:led|lead|leads|leading|managed|manages|managing|directed|directs|directing|headed|heading|supervised|supervises|supervising)\s+(?:a\s+|an\s+|the\s+|our\s+|their\s+|\d+\s+)?(?:cross[-\s]?functional\s+)?(?:team|teams|staff|employees|engineers|developers|workers|personnel|people|direct\s+reports?)|direct\s+reports?)\b/u;
const EXTERNAL_AUDIENCE = /\bexternal\s+(?:users?|clients?|customers?|partners?|audiences?)\b/u;
const PRODUCTION = /\b(?:production|live\s+environment)\b/u;
// Match supporting-role qualifiers while ignoring outcome phrases like "guides to help onboard staff".
const LIMITED_PARTICIPATION = /\b(?:assist(?:ed|ing)?|contribut(?:ed|ing)\s+to|helped\s+(?:with|in|the\s+team|developers|engineers|colleagues|staff))\b/u;
const PARTICIPATION_WORDING = /\b(?:assist(?:ed|ing)?|help(?:ed|ing)?|contribut(?:ed|ing)\s+to|support(?:ed|ing)?|participat(?:ed|ing)|collaborat(?:ed|ing)|partner(?:ed|ing))\b/u;
const CLASSROOM = /\b(?:classroom|class\s+(?:project|exercise|assignment))\b/u;
const COURSEWORK = /\b(?:coursework|course\s+(?:project|exercise|assignment))\b/u;
const PROTOTYPE = /\b(?:prototype|proof[-\s]+of[-\s]+concept)\b/u;
const SUPERVISED = /\b(?:under (?:direct )?supervision|under (?:the )?guidance|supervised by)\b/u;
const INDEPENDENT = /\b(?:independently|without supervision|unsupervised)\b/u;

function hasNegation(text: string): boolean {
  // “Not only X but also Y” is a positive idiom, not a qualification.
  return NEGATION.test(text.replace(/\bnot\s+only\b/gu, '')) || /\bnon[-\s]+production\b/u.test(text);
}
function claimsPeopleManagement(text: string): boolean {
  return PEOPLE_MANAGEMENT.test(text);
}

export function scopeRisk(text: string, support: readonly string[]): string[] {
  const proposed = normalize(text), sources = support.map(normalize);
  if (sources.some(source => source.trim() === proposed.trim())) return [];
  const risks: string[] = [];
  if (sources.some(hasNegation) && !hasNegation(proposed))
    risks.push('a limitation in the cited wording may have been lost');
  if (hasNegation(proposed) && !sources.some(hasNegation))
    risks.push('a negative statement was not clearly stated in the cited wording');
  if (claimsPeopleManagement(proposed) && !sources.some(claimsPeopleManagement))
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