/**
 * Narrow English-language warning signals for changed AI prose. These are
 * conservative literal checks, not a semantic, factual or safety verifier.
 */

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[’]/g, "'");
const NEGATION = /\b(?:no|not|never|without|cannot|can't|couldn't|didn't|doesn't|don't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|won't|wouldn't)\b/u;
// Match direct people-management claims ("managed a team", "led the backend team", "supervised staff", "direct reports"),
// excluding prepositional work phrases ("managed tools for engineers", "managed operations across teams")
// and noun-modifier phrases ("managed team workflows", "managed staff schedules").
const PEOPLE_MANAGEMENT = /\b(?:(?:led|lead|leads|leading|managed|manages|managing|directed|directs|directing|headed|heading|supervised|supervises|supervising|oversaw|oversee(?:s|ing)?)\s+(?:a\s+|an\s+|the\s+|our\s+|their\s+|\d+\s+)?(?:(?!(?:for|with|across|among|between|to|by|of|in|on|at|from|into|through)\b)[\w-]+\s+){0,2}(?:team|teams|staff|employees|engineers|developers|workers|personnel|people|direct\s+reports?)(?!\s+(?:workflows?|schedules?|backlogs?|sprints?|meetings?|standups?|onboarding|documentation|processes?|operations?|tools?|tooling|projects?|initiatives?|standards?|reviews?|training|materials?|resources?|calendars?|budgets?|payroll|shifts?|rosters?|rotations?|benefits|recruitment|records?|quotas?|pipelines?|territories|campaigns?|deliverables?|compliance))|direct\s+reports?|(?:team|tech(?:nical)?|engineering)\s+lead|(?:people|line|engineering)\s+manager)\b/u;
const EXTERNAL_AUDIENCE = /\bexternal\s+(?:users?|clients?|customers?|partners?|audiences?)\b/u;
const PRODUCTION = /\b(?:production|prod|live\s+(?:environment|system|traffic|users?))\b/u;
// Match supporting-role qualifiers while ignoring customer-service ("assisted clients") and outcome phrases ("to help onboard staff").
const LIMITED_PARTICIPATION = /\b(?:assist(?:ed|ing)?(?!\s+(?:(?:\d+\+?\s+|(?:new|key|enterprise|prospective|incoming|elderly|pediatric|acute|outpatient|inpatient|retail|commercial|corporate|individual)\s+)?(?:customers?|clients?|users?|guests?|visitors?|patients?|students?|residents?|families|applicants?|candidates?|borrowers?|taxpayers?|policyholders?|members?)))|contribut(?:ed|ing)\s+to|helped\s+(?:with|in|the\s+team|developers|engineers|colleagues|staff|build|develop|create|design|implement|maintain|migrate|deploy|test|write|fix|debug|optimize|manage|organize|prepare|deliver|launch|ship))\b/u;
const PARTICIPATION_WORDING = /\b(?:assist(?:ed|ing)?|aid(?:ed|ing)?|help(?:ed|ing)?|contribut(?:ed|ing)\s+to|support(?:ed|ing)?|participat(?:ed|ing)|collaborat(?:ed|ing)|partner(?:ed|ing)|co-?(?:developed|built|authored|designed|engineered|implemented|created|maintained)|jointly|alongside|in\s+(?:collaboration|partnership)\s+with|worked\s+(?:with|alongside))\b/u;
const CLASSROOM = /\b(?:classroom(?!\s+(?:management|instruction|behavior|behaviour|teaching|learning|technology|curriculum|environment|routines?|settings?|support|aides?|assistants?|teachers?|lessons?|activities|engagement|assessments?))|(?:class|academic|university|school|capstone|lab|hackathon)\s+(?:project|exercise|assignment))\b/u;
const COURSEWORK = /\b(?:coursework|course\s+(?:project|exercise|assignment))\b/u;
const PROTOTYPE = /\b(?:prototyp(?:e|ed|ing|es)|proof[-\s]+of[-\s]+concept|(?<!(?:primary|main|key|lead|single|client|account|vendor|customer|hr|internal|external|dedicated)\s+)poc(?!\s+for\b)|mock\s+(?:data|api|environment)|sandbox)\b/u;
const SUPERVISED = /\b(?:(?:under|with)\s+(?:direct\s+)?supervision|(?:under|with)\s+(?:the\s+)?guidance|supervised\s+by|mentored\s+by|under\s+(?:a\s+)?mentor)\b/u;
const INDEPENDENT = /\b(?:independently|without supervision|unsupervised)\b/u;
const SENIORITY_TITLE = /\b(?:(?:senior|sr\.?|principal|chief|head\s+of|director|vp|vice\s+president)\s+(?:software|backend|frontend|full[-\s]?stack|systems?|data|ml|ai|cloud|devops|security|platform|site\s+reliability|product|project|archive|operations?|financial|marketing|sales|tax|clinical|registered|civil|mechanical|structural|hr|legal|brand|account|nursing|healthcare)?\s*(?:engineer|developer|architect|designer|analyst|scientist|specialist|coordinator|consultant|manager|lead|accountant|auditor|attorney|counsel|lawyer|paralegal|nurse|physician|therapist|pharmacist|clinician|representative|executive|recruiter|generalist|marketer|strategist|planner|buyer|teacher|instructor|professor|educator|controller|officer|advisor)|staff\s+(?:software|backend|frontend|full[-\s]?stack|systems?|data|ml|ai|cloud|devops|security|platform|site\s+reliability|product|project)?\s*(?:engineer|developer|architect|designer|scientist|accountant))\b/u;
// Require explicit degree wording (or dotted abbreviations) so "50 ms" or "Associate Software Engineer" never false-positives.
const DEGREE_TERM = /\b(?:bachelor(?:'s)?|master(?:'s)?\s+(?:of|in|degree)|associate(?:'s)?\s+(?:of|in|degree)|b\.s\.c?\.?|b\.a\.|b\.eng\.?|m\.s\.c?\.?|m\.a\.|m\.b\.a\.|ph\.d\.?|mba|phd|b\.s\.n\.?|bsn|m\.s\.n\.?|msn|d\.n\.p\.?|dnp|m\.ed\.?|b\.ed\.?|b\.b\.a\.?|bba|m\.p\.h\.?|mph|j\.d\.?|m\.d\.?|diploma|(?<!\d-)degree)\b/u;
const IN_PROGRESS_EDU_STRICT = /\b(?:expected|anticipated|projected|in\s+progress|ongoing|pursuing|studying|enrolled|current(?:ly)?|present|candidate|student|upcoming|est\.?)\b/u;
const COMPLETED_DEGREE_CLAIM = /\b(?:graduated|graduate(?!\s+(?:student|candidate|program|coursework|studies|research|assistant|degree\s+in\s+progress))\b|earned\s+(?:a|an|my)|hold(?:s|ing)?\s+(?:a|an)\s+(?:bachelor|master|b\.s|b\.a|m\.s|m\.a|mba|phd|ph\.d|associate|degree)|with\s+(?:a|an)\s+(?:bachelor|master|b\.s|b\.a|m\.s|m\.a|mba|phd|ph\.d|associate|degree))\b/u;

function hasNegation(text: string): boolean {
  // “Not only X but also Y” is a positive idiom, not a qualification.
  // Normalize “zero downtime” to match “without downtime” / “no downtime”.
  const cleaned = text.replace(/\bnot\s+only\b/gu, '').replace(/\bzero[-\s]+downtime\b/gu, 'without downtime');
  return NEGATION.test(cleaned) || /\b(?:non|pre)[-\s]*prod(?:uction)?\b/u.test(cleaned);
}
function claimsProduction(text: string): boolean {
  const cleaned = text
    .replace(/\b(?:non|pre)[-\s]*prod(?:uction)?\b/gu, '')
    .replace(/\bproduction\s+(?:lines?|schedules?|runs?|floors?|planning|targets?|quotas?|costs?|volumes?|outputs?|capacit(?:y|ies)|workflows?|cycles?|facilities|plants?|batches?)\b/gu, '')
    .replace(/\b(?:video|content|media|print|creative|event|audio|film|stage|editorial)\s+production\b/gu, '');
  return PRODUCTION.test(cleaned);
}
function claimsPeopleManagement(text: string): boolean {
  return PEOPLE_MANAGEMENT.test(text);
}
function hasFutureYear(text: string, currentYear: number): boolean {
  const years = Array.from(text.matchAll(/\b(19\d{2}|20\d{2})\b/g), m => Number(m[1]));
  return years.some(y => y > currentYear && y <= currentYear + 10);
}
function isInProgressEducation(text: string, currentYear: number): boolean {
  return DEGREE_TERM.test(text) && (IN_PROGRESS_EDU_STRICT.test(text) || hasFutureYear(text, currentYear));
}

export function scopeRisk(text: string, support: readonly string[], currentYear = new Date().getFullYear()): string[] {
  const proposed = normalize(text), sources = support.map(normalize);
  if (sources.some(source => source.trim() === proposed.trim())) return [];
  const risks: string[] = [];
  if (sources.some(hasNegation) && !hasNegation(proposed))
    risks.push('a limitation in the cited wording may have been lost');
  if (hasNegation(proposed) && !sources.some(hasNegation))
    risks.push('a negative statement was not clearly stated in the cited wording');
  if (claimsPeopleManagement(proposed) && !sources.some(claimsPeopleManagement))
    risks.push('team leadership was not clearly stated in the cited wording');
  if (SENIORITY_TITLE.test(proposed) && !sources.some(source => SENIORITY_TITLE.test(source)))
    risks.push('a seniority level was not clearly stated in the cited wording');
  if (EXTERNAL_AUDIENCE.test(proposed) && !sources.some(source => EXTERNAL_AUDIENCE.test(source)))
    risks.push('the external audience was not clearly stated in the cited wording');
  if (claimsProduction(proposed) && !sources.some(claimsProduction))
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
  const hasInProgressDegree = sources.some(source => isInProgressEducation(source, currentYear));
  if (hasInProgressDegree) {
    const hasCompletedDegree = sources.some(source => DEGREE_TERM.test(source) && !isInProgressEducation(source, currentYear));
    const proposedMarksInProgress = IN_PROGRESS_EDU_STRICT.test(proposed) || hasFutureYear(proposed, currentYear);
    if (!proposedMarksInProgress && (COMPLETED_DEGREE_CLAIM.test(proposed) || DEGREE_TERM.test(proposed))) {
      risks.push('an in-progress or expected degree qualification may have been presented as completed');
    } else if (!hasCompletedDegree && COMPLETED_DEGREE_CLAIM.test(proposed)) {
      risks.push('an in-progress or expected degree qualification may have been presented as completed');
    }
  }
  return risks;
}
