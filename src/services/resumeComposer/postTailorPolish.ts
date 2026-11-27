/**
 * Deterministic, truthful post-compile tailoring polish applied in workflow.ts.
 * Never fabricates employers, metrics, seniority, or skills absent from the source CV.
 * Every mutation is snapshotted in compositionSnapshot so users can revert with 1 click.
 */
import type { CVProfile, CertificationEntry, ProjectEntry, SkillTag } from '@/types/schema';
import { containsSkillName } from './summaryBoundary';

const NEGATED_JOB_LINE = /\b(?:no|not|never|without|avoid|exclude|excluded|unnecessary|irrelevant|optional|neither|nor|rather than|not required|no longer|isn['’]t|aren['’]t|don['’]t|doesn['’]t|can['’]t|shouldn['’]t|unrelated|nonessential|non-essential|lack|lacks|lacking)\b/i;
const QUALIFIER_STOPWORDS = new Set([
  'basic', 'beginner', 'intermediate', 'advanced', 'proficient', 'fluent', 'native',
  'familiar', 'working', 'working knowledge', 'foundational', 'core', 'learning', 'expert',
]);
const AMBIGUOUS_SHORT_SKILLS = new Set(['go', 'c', 'r']);
const ACRONYM_STOPWORDS = new Set([
  'AND', 'THE', 'FOR', 'WITH', 'FROM', 'YOU', 'YOUR', 'ALL', 'ANY', 'NOT', 'YES',
  'OUR', 'JOB', 'CV', 'USA', 'USD', 'UK', 'EU', 'EEO', 'CEO', 'CTO', 'HR', 'LLC', 'INC', 'ETC', 'API', 'APIS',
]);
const DISTINCTIVE_TOKEN = /[A-Za-z][A-Za-z0-9+#]*/g;
const HYPHEN_TO_SPACE = /[\-\u2010-\u2015]+/gu;
const SENIORITY_PREFIX = /^(?:senior|sr\.?|staff|principal|lead|chief|head\s+of|director(?:\s+of)?|vp|vice\s+president|junior|jr\.?|mid[-\s]?level|entry[-\s]?level|associate)\s+/i;
const LEVEL_SUFFIX = /\s+(?:i{1,3}|iv|v|[1-5])$/i;
const LEADERSHIP_SUFFIX = /\s+(?:lead|manager)$/i;
const AMBIGUOUS_TWO_LETTER = new Set(['cd', 'it', 'go', 'or', 'in', 'us', 'an', 'as', 'at', 'be', 'by', 'do', 'if', 'is', 'no', 'of', 'on', 'so', 'to', 'up', 'we']);

const GENERIC_JOB_WORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'that', 'this', 'will', 'have', 'your', 'our', 'are',
  'you', 'can', 'not', 'but', 'all', 'any', 'into', 'over', 'such', 'more', 'work', 'team',
  'teams', 'role', 'position', 'company', 'looking', 'seeking', 'ideal', 'candidate', 'strong',
  'experience', 'skills', 'skill', 'ability', 'knowledge', 'understanding', 'responsibilities',
  'requirements', 'preferred', 'qualifications', 'including', 'using', 'build', 'maintain',
  'develop', 'support', 'collaborate', 'write', 'clear', 'practical', 'similar', 'years', 'plus',
  'in', 'on', 'at', 'to', 'of', 'or', 'as', 'is', 'it', 'by', 'be', 'an', 'we', 'do', 'if', 'up', 'so', 'no', 'us',
]);

function splitJobPolarity(job: string): { positive: string; negated: string } {
  const lines = job.split(/[\n;!?]+|\.(?=\s+[A-Z]|\s*$)/u).map(l => l.trim()).filter(Boolean);
  return {
    positive: lines.filter(l => !NEGATED_JOB_LINE.test(l)).join('\n'),
    negated: lines.filter(l => NEGATED_JOB_LINE.test(l)).join('\n'),
  };
}

export function extractSkillMatchTerms(rawLabel: string): string[] {
  const terms: string[] = [];
  const addTerm = (term: string) => {
    const clean = term.trim();
    const lower = clean.toLowerCase();
    if (!clean || clean.length < 2 || /^\d/.test(clean) || QUALIFIER_STOPWORDS.has(lower) || AMBIGUOUS_SHORT_SKILLS.has(lower)) return;
    if (!terms.includes(clean)) terms.push(clean);
  };
  addTerm(rawLabel);
  for (const chunk of rawLabel.split(/[(),]+/u).map(p => p.trim()).filter(Boolean)) {
    addTerm(chunk);
    if (chunk.includes('&')) {
      for (const ampPart of chunk.split('&').map(p => p.trim()).filter(Boolean)) {
        if (ampPart.includes(' ') || /[A-Z]{2,}|[+#]/.test(ampPart)) addTerm(ampPart);
      }
    }
    if (chunk.includes('/')) {
      for (const sp of chunk.split('/').map(p => p.trim()).filter(Boolean)) {
        const isSafeTwoLetter = /^[A-Z]{2}$/.test(sp) && !/^ci\/cd$/i.test(chunk) && !AMBIGUOUS_TWO_LETTER.has(sp.toLowerCase());
        if (sp.length >= 3 || /[+#]/.test(sp) || isSafeTwoLetter) addTerm(sp);
      }
    }
    const isAllCapsMultiWord = chunk === chunk.toUpperCase() && chunk.includes(' ');
    if (!isAllCapsMultiWord) {
      for (const token of chunk.match(DISTINCTIVE_TOKEN) || []) {
        const upperCount = (token.match(/[A-Z]/g) || []).length;
        const isDistinctiveAcronym = token.length >= 3 && upperCount >= 2;
        const isSymbolicTech = /^[A-Za-z][A-Za-z0-9]*[+#]+$/.test(token);
        if ((isDistinctiveAcronym || isSymbolicTech) && !ACRONYM_STOPWORDS.has(token.toUpperCase())) {
          addTerm(token);
        }
      }
    }
  }
  return terms;
}

function matchesJobTerm(jobText: string, term: string): boolean {
  if (!jobText) return false;
  if (containsSkillName(jobText, term)) return true;
  if (term.includes(' ')) {
    return containsSkillName(jobText.replace(HYPHEN_TO_SPACE, ' ').replace(/\s+/gu, ' '), term);
  }
  return false;
}

export function findJobMatchedNativeSkills(skills: readonly SkillTag[], job: string): SkillTag[] {
  const { positive, negated } = splitJobPolarity(job);
  if (!positive) return [];
  const matched: SkillTag[] = [];
  const seenNames = new Set<string>();
  for (const skill of skills) {
    const label = skill.name.trim();
    const key = label.toLowerCase();
    if (!label || seenNames.has(key)) continue;
    const terms = extractSkillMatchTerms(label);
    if (terms.some(term => matchesJobTerm(positive, term) && !matchesJobTerm(negated, term))) {
      seenNames.add(key);
      matched.push(skill);
    }
  }
  return matched;
}

/**
 * Guarantees that every JD-matched native skill from the source CV is retained in
 * the tailored skills list (when skills are unlocked and non-empty), inserting any
 * dropped skill alongside its category without renaming or fabricating skills.
 */
const normSkillKey = (name: string) => name.normalize('NFKC').toLowerCase().replace(/\s*([/&\-–—])\s*/gu, '$1').replace(/\s+/gu, ' ').trim();

export function ensureJobMatchedSkills(source: CVProfile, copy: CVProfile, job: string): number {
  if (source.skills.isLocked || !copy.skills.data.length) return 0;
  const matched = findJobMatchedNativeSkills(source.skills.data, job);
  if (!matched.length) return 0;
  const existing = new Set(copy.skills.data.map(s => normSkillKey(s.name)));
  const existingIds = new Set(copy.skills.data.map(s => s.id));
  let added = 0;
  for (const skill of matched) {
    const key = normSkillKey(skill.name);
    if (existing.has(key) || existingIds.has(skill.id)) continue;
    existing.add(key);
    existingIds.add(skill.id);
    // Insert right after the last skill in the same category so display grouping stays clean.
    let insertAt = -1;
    for (let i = copy.skills.data.length - 1; i >= 0; i--) {
      if (copy.skills.data[i].category === skill.category) {
        insertAt = i + 1;
        break;
      }
    }
    const clone = { ...skill };
    if (insertAt >= 0) copy.skills.data.splice(insertAt, 0, clone);
    else copy.skills.data.push(clone);
    added++;
  }
  return added;
}

/**
 * Extracts a clean, seniority-stripped target role title from the job description
 * and returns a truthful tailored top CV headline only when the candidate's existing
 * headline is a direct base role match (e.g. "Software Engineer" -> "Backend Software Engineer").
 */
export function deriveTailoredHeadline(source: CVProfile, copy: CVProfile, job: string): string | null {
  if (source.headline.isLocked || source.resumeHeader.isLocked) return null;
  if (source.resumeHeader.data.useAsHeadline === false) return null;
  const current = (source.resumeHeader.data.desiredJobPosition?.trim() || source.headline.data || '').trim();
  if (!current) return null;

  const lines = job.split(/\r?\n/u).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  let rawTarget = '';
  const firstLine = lines[0].replace(/^(?:job\s+title|role|position)\s*[:\-–—]\s*/i, '').trim();
  if (firstLine.length >= 4 && firstLine.length <= 72 && !/[.!?:]$/.test(firstLine) && firstLine.split(/\s+/).length <= 8) {
    rawTarget = firstLine;
  } else {
    const lookingMatch = /\b(?:looking\s+for|hiring|seeking)\s+(?:a|an)\s+([A-Z][A-Za-z0-9/+\-\s]{3,50}?)(?:\s+(?:to|who|with|for|at|in|joining|that)\b|[.,;\n])/u.exec(job);
    if (lookingMatch) rawTarget = lookingMatch[1].trim();
  }
  if (!rawTarget) return null;

  // Strip parentheticals, trailing location/work-mode segments ("- Remote", "| NYC"), and repeated halves
  // BEFORE stripping seniority prefixes/suffixes so "(Remote) Senior ... III" is cleaned completely.
  let candidateTitle = rawTarget
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+[-–—|]\s+.+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  const dupHalf = /^(.+?)\s+\1$/i.exec(candidateTitle);
  if (dupHalf) candidateTitle = dupHalf[1].trim();
  candidateTitle = candidateTitle
    .replace(SENIORITY_PREFIX, '')
    .replace(SENIORITY_PREFIX, '')
    .replace(LEVEL_SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!LEADERSHIP_SUFFIX.test(current)) {
    candidateTitle = candidateTitle.replace(LEADERSHIP_SUFFIX, '').trim();
  }

  if (!candidateTitle || candidateTitle.length > 60) return null;
  const currentNorm = current.toLowerCase().replace(/\s+/g, ' ');
  const targetNorm = candidateTitle.toLowerCase();
  if (targetNorm === currentNorm) return null;

  // Require the candidate's current role title to be a literal suffix/substring of the target title
  // (e.g. "Software Engineer" inside "Backend Software Engineer") AND require >= 2 JD-matched skills
  // on the candidate's CV so we only specialize when genuinely backed by their stack.
  const baseRole = currentNorm.replace(SENIORITY_PREFIX, '').trim();
  if (!baseRole || baseRole.length < 5 || !targetNorm.includes(baseRole)) return null;

  const matchedSkills = findJobMatchedNativeSkills(copy.skills.data.length ? copy.skills.data : source.skills.data, job);
  if (matchedSkills.length < 2) return null;

  return candidateTitle;
}

/**
 * When the tailored summary is unusually short (<25 words) or mentions zero of the
 * candidate's JD-matched concrete technical skills, appends ONE truthful toolkit
 * sentence grounded strictly in the candidate's own JD-matched skills (no employer claims).
 */
export function enrichSummaryWithToolkit(source: CVProfile, copy: CVProfile, job: string): boolean {
  if (source.summary.isLocked) return false;
  const summary = copy.summary.data.trim();
  if (!summary || /\bcore\s+(?:skills|competencies|technical\s+toolkit)\s+include/i.test(summary)) return false;
  // Never append English prose to non-Latin (e.g. Arabic/Cyrillic/CJK) summaries.
  if (!/[A-Za-z]{3,}/.test(summary) || /[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(summary)) return false;

  const matched = findJobMatchedNativeSkills(copy.skills.data.length ? copy.skills.data : source.skills.data, job)
    .filter(s => s.category !== 'Soft');
  if (matched.length < 2) return false;

  const wordCount = summary.split(/\s+/).filter(Boolean).length;
  const alreadyMentionsConcrete = matched.some(s => containsSkillName(summary, s.name.split('(')[0].trim()));
  if (alreadyMentionsConcrete && wordCount >= 26) return false;
  if (wordCount > 65) return false;

  const unmentioned = matched.filter(s => !containsSkillName(summary, s.name.split('(')[0].trim()));
  if (unmentioned.length < 2) return false;
  const topSkills = unmentioned.slice(0, 7).map(s => s.name.trim());
  const listText = topSkills.length === 2
    ? `${topSkills[0]} and ${topSkills[1]}`
    : `${topSkills.slice(0, -1).join(', ')}, and ${topSkills[topSkills.length - 1]}`;
  const ending = /[.!?]$/.test(summary) ? '' : '.';
  copy.summary.data = `${summary}${ending} Core skills include ${listText}.`;
  return true;
}

function extractPositiveJobKeywords(job: string): string[] {
  const { positive } = splitJobPolarity(job);
  if (!positive) return [];
  const rawTokens = positive.match(/[A-Za-z][A-Za-z0-9+#.-]{1,}/g) || [];
  const keywords = new Set<string>();
  for (const tok of rawTokens) {
    const clean = tok.replace(/[.,-]+$/g, '');
    const lower = clean.toLowerCase();
    if (clean.length < 2 || GENERIC_JOB_WORDS.has(lower)) continue;
    if (clean.length === 2 && !/[+#]/.test(clean) && !/^[A-Z]{2}$/.test(clean)) continue;
    keywords.add(clean);
    const stdPrefix = /^([A-Z]{3,})-[A-Za-z0-9]+$/.exec(clean);
    if (stdPrefix && !ACRONYM_STOPWORDS.has(stdPrefix[1])) keywords.add(stdPrefix[1]);
  }
  return [...keywords];
}

function scoreTextAgainstJob(text: string, jobKeywords: readonly string[]): number {
  if (!text.trim() || !jobKeywords.length) return 0;
  let score = 0;
  for (const kw of jobKeywords) {
    if (containsSkillName(text, kw)) {
      score += /[+#]|[A-Z]{2,}/.test(kw) ? 2 : 1;
    }
  }
  return score;
}

export function sortCertificationsByRelevance(
  certs: readonly CertificationEntry[],
  job: string,
): { sorted: CertificationEntry[]; reordered: boolean } {
  if (certs.length < 2) return { sorted: [...certs], reordered: false };
  const keywords = extractPositiveJobKeywords(job);
  if (!keywords.length) return { sorted: [...certs], reordered: false };
  const scored = certs.map((cert, index) => ({
    cert,
    index,
    score: scoreTextAgainstJob(`${cert.name} ${cert.issuer}`, keywords),
  }));
  const maxScore = Math.max(...scored.map(s => s.score));
  if (maxScore <= 0) return { sorted: [...certs], reordered: false };
  const sorted = [...scored]
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
    .map(s => s.cert);
  const reordered = sorted.some((c, i) => c.id !== certs[i].id);
  return { sorted, reordered };
}

export function sortProjectsByRelevance(
  projects: readonly ProjectEntry[],
  job: string,
): { sorted: ProjectEntry[]; reordered: boolean } {
  if (projects.length < 2) return { sorted: [...projects], reordered: false };
  const keywords = extractPositiveJobKeywords(job);
  if (!keywords.length) return { sorted: [...projects], reordered: false };
  const scored = projects.map((proj, index) => ({
    proj,
    index,
    score: scoreTextAgainstJob(
      [proj.name, proj.role ?? '', ...proj.bullets.map(b => b.text)].join(' '),
      keywords,
    ),
  }));
  const maxScore = Math.max(...scored.map(s => s.score));
  if (maxScore <= 0) return { sorted: [...projects], reordered: false };
  const sorted = [...scored]
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
    .map(s => s.proj);
  const reordered = sorted.some((p, i) => p.id !== projects[i].id);
  return { sorted, reordered };
}

/**
 * Deterministic "Human Polish" punctuation pass (adapted from Tailrd's post-pass).
 * Normalizes AI-tell mid-sentence em-dashes, curly smart quotes, and stray spacing
 * without changing any facts, numbers, skills, or proper nouns.
 * Only applied to rewritten unlocked text; untouched source bullets remain byte-for-byte identical.
 */
export function polishHumanPunctuation(text: string): string {
  if (!text) return text;
  // Preserve URLs verbatim so em-dashes or dots inside links are never altered.
  const urls: string[] = [];
  let out = text.replace(/https?:\/\/\S+/gi, (match) => {
    const idx = urls.push(match) - 1;
    return `\u0000URL${idx}\u0000`;
  });
  out = out
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  // Replace AI-overused mid-sentence em-dashes between words with a clean comma.
  out = out.replace(/([A-Za-z0-9)%])\s*\u2014\s*([A-Za-z])/g, '$1, $2');
  // Collapse accidental horizontal double spaces and stray spaces before sentence punctuation
  // (never collapsing newlines or spaces before dot-prefixed tokens like .NET, .csv, .env).
  out = out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:!?])(?=$|[\s)\]}"'])/g, '$1')
    .replace(/,{2,}/g, ',')
    .trim();
  if (urls.length) {
    out = out.replace(/\u0000URL(\d+)\u0000/g, (_, idx) => urls[Number(idx)] ?? '');
  }
  return out;
}

export function polishTailoredCopyPunctuation(source: CVProfile, copy: CVProfile): void {
  if (!source.summary.isLocked && copy.summary.data && copy.summary.data !== source.summary.data) {
    copy.summary.data = polishHumanPunctuation(copy.summary.data);
  }
  if (!source.experience.isLocked) {
    const srcById = new Map(source.experience.data.map(e => [e.id, e]));
    for (const exp of copy.experience.data) {
      const srcExp = srcById.get(exp.id);
      if (exp.description && exp.description !== (srcExp?.description ?? '')) {
        exp.description = polishHumanPunctuation(exp.description);
      }
      const srcBulletTexts = new Set((srcExp?.bullets ?? []).map(b => b.text));
      for (const b of exp.bullets) {
        if (b.text && !srcBulletTexts.has(b.text)) {
          b.text = polishHumanPunctuation(b.text);
        }
      }
    }
  }
  if (!source.projects.isLocked) {
    const srcById = new Map(source.projects.data.map(p => [p.id, p]));
    for (const proj of copy.projects.data) {
      const srcProj = srcById.get(proj.id);
      const srcBulletTexts = new Set((srcProj?.bullets ?? []).map(b => b.text));
      for (const b of proj.bullets) {
        if (b.text && !srcBulletTexts.has(b.text)) {
          b.text = polishHumanPunctuation(b.text);
        }
      }
    }
  }
}

const OVERLAP_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'such', 'more',
  'all', 'any', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'its', 'their',
  'in', 'on', 'at', 'to', 'of', 'or', 'as', 'is', 'it', 'by', 'be', 'an', 'a',
]);

const ROLE_LINKING_ENDING = /\b(?:served|worked|acted|operated|functioned|serving|working|acting|hired|appointed|recognized|known|designated|selected|positioned|joined|promoted)$/i;

function contentTokens(text: string): Set<string> {
  const normalized = (text || '')
    .normalize('NFKC')
    .replace(/\p{M}+/gu, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
  const words = normalized
    .split(/[^\p{L}\p{N}+#]+/gu)
    .filter(w => w.length >= 3 && !OVERLAP_STOPWORDS.has(w));
  return new Set(words);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roleTitleCandidates(roleTitle: string): string[] {
  const clean = (roleTitle || '').replace(/\s+/g, ' ').trim();
  if (clean.length < 3) return [];
  const candidates = new Set<string>([clean]);
  const noParens = clean.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (noParens.length >= 3) candidates.add(noParens);
  const beforeQual = noParens.replace(/\s+(?:for|in|of)\s+.+$/i, '').trim();
  if (beforeQual.length >= 3) candidates.add(beforeQual);
  return [...candidates].sort((a, b) => b.length - a.length);
}

function stripTrailingRoleEcho(text: string, roleTitle: string): string {
  const candidates = roleTitleCandidates(roleTitle);
  if (!text || !candidates.length) return text;
  const trimmedFull = text.trim();
  for (const cand of candidates) {
    const pattern = escapeRegExp(cand).replace(/\\ /g, '\\s+');
    const re = new RegExp(`\\s+as\\s+(?:an?\\s+)?${pattern}\\s*([.!?])?$`, 'i');
    const m = re.exec(trimmedFull);
    if (!m) continue;
    const prefix = trimmedFull.slice(0, m.index).replace(/[,;:\s]+$/, '');
    const wordCount = prefix.split(/\s+/).filter(Boolean).length;
    if (wordCount < 4 || ROLE_LINKING_ENDING.test(prefix)) return text;
    return `${prefix}${m[1] || ''}`;
  }
  return text;
}

/**
 * Eliminates duplicate overview+bullet repetition after tailoring:
 * 1. Strips tautological trailing "as a <RoleTitle>" echoes from tailored descriptions/bullets
 *    (only when >= 4 words remain and the prefix doesn't end in a role-linking verb like "served").
 * 2. Clears redundant role description when the tailor converted a bulletless source overview into
 *    bullets, or when the tailor rewrote a description that overlaps >= 45% with its bullets.
 *    Never wipes an untouched user-authored description when the source role already had bullets.
 */
export function deduplicateRoleOverviews(source: CVProfile, copy: CVProfile): number {
  if (source.experience.isLocked) return 0;
  let cleaned = 0;
  const sourceById = new Map(source.experience.data.map(e => [e.id, e]));

  for (const entry of copy.experience.data) {
    const orig = sourceById.get(entry.id);
    const origDesc = (orig?.description || '').trim();
    const curDesc = (entry.description || '').trim();
    const descChanged = curDesc !== origDesc;
    const nonEmptyBullets = entry.bullets.filter(b => b.text.trim());

    // Strip redundant "as a <RoleTitle>" from tailored description or bullets
    if (curDesc && descChanged) {
      const stripped = stripTrailingRoleEcho(curDesc, entry.roleTitle);
      if (stripped !== curDesc) {
        entry.description = stripped;
        cleaned++;
      }
    }
    for (const b of entry.bullets) {
      const origBullet = orig?.bullets.find(ob => ob.id === b.id)?.text.trim();
      if (b.text.trim() && b.text.trim() !== origBullet) {
        const stripped = stripTrailingRoleEcho(b.text, entry.roleTitle);
        if (stripped !== b.text) {
          b.text = stripped;
          cleaned++;
        }
      }
    }

    const updatedDesc = (entry.description || '').trim();
    if (!updatedDesc || nonEmptyBullets.length === 0) continue;

    const origHadZeroBullets = Boolean(orig && orig.bullets.filter(b => b.text.trim()).length === 0);
    // Preserve untouched user-authored descriptions when the source role already had bullets
    if (!origHadZeroBullets && !descChanged) continue;

    const descTokens = contentTokens(updatedDesc);
    if (descTokens.size < 3 && !origHadZeroBullets) continue;

    const bulletTokens = contentTokens(nonEmptyBullets.map(b => b.text).join(' '));
    let shared = 0;
    for (const tok of descTokens) {
      if (bulletTokens.has(tok)) shared++;
    }
    const overlap = descTokens.size > 0 ? shared / descTokens.size : 0;

    if (overlap >= 0.45 || (origHadZeroBullets && overlap >= 0.30)) {
      entry.description = '';
      cleaned++;
    }
  }
  return cleaned;
}
