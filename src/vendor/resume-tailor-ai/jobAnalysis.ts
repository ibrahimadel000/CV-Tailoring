// Adapted from JaimeYeung/Resume-Tailor-AI lib/prompts.ts buildJDReportPrompt.
// MIT declared in upstream README, commit f3c2c327c7f4deb1ae4fbbd4389f879b2e225d83.
// Changes: no 3000-char truncation, no ATS score, no automatic missing-skill
// insertion, no blanket dismissal of communication, application-owned refs.
export function buildJDReportPrompt():string {
  return `Analyze the job before writing: distinguish role/function, hard skills (tools, languages, technical methods), action + object responsibilities, business context, domain expertise and hard filters (qualifications, required experience). Prioritize decisive requirements, required before preferred. Communication is relevant when the role explicitly requires explaining or reviewing technical work. Use the complete requirement passages supplied by the application; never shorten a compound requirement to its easiest part. Report related or missing evidence honestly; do not compute an ATS or suitability score. A listed skill or basic certificate is not proof of practical work. Select up to six important requirement IDs, including decisive gaps, not salary or application logistics.`;
}
