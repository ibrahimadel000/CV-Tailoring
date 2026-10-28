import { z } from 'zod';
import { checkContentPlan, planLinks, summaryPlanned, limitedWordingChange } from '@/services/tailorContentPlan';
import { metricScopeIssue } from '@/services/composer/metricScope';
import { wordingIssue, skillPracticeIssue } from '@/services/tailorGrounding';
import { cvProfileSchema, supportingEvidenceSchema, type CVProfile } from '@/types/schema';

export const TAILOR_VERSION = 'structured-draft-b27';
export const JOB_LIMIT = 24000;
export const SOURCE_LIMIT = 56000;
const shortText = z.string().trim().max(160);
export const tailorPatchSchema = z.object({
  contentPlan:z.array(z.object({target:z.enum(['summary','experience','projects','skills']),entryId:z.string().max(120),bulletId:z.string().max(120),intent:z.enum(['emphasize_result','clarify_scope','reduce_repetition','surface_relevance','organize_skills']),jobQuote:z.string().trim().min(3).max(280),evidenceIds:z.array(z.string().min(1).max(120)).min(1).max(32)}).strict()).max(16).optional().default([]),
  skillGroups:z.array(z.object({category:z.enum(['Technical','Soft','Tools','Languages']),skillIds:z.array(z.string().uuid()).min(1).max(150)}).strict()).max(4).optional().default([]),
  jobTitle: shortText,
  company: shortText,
  summary: z.string().trim().max(1800),
  bullets: z.array(z.object({
    section: z.enum(['experience', 'projects']),
    entryId: z.string().uuid(),
    bulletId: z.string().uuid(),
    text: z.string().trim().min(1).max(900),
    jobQuote: z.string().trim().max(280).optional().default(''),
  }).strict()).max(32),
  skillOrder: z.array(z.string().uuid()).max(150),
  bulletOrder: z.array(z.object({
    section: z.enum(['experience', 'projects']), entryId: z.string().uuid(),
    bulletIds: z.array(z.string().uuid()).min(1).max(32), jobQuote: z.string().trim().min(3).max(280),
  }).strict()).max(12).optional().default([]),
  missingRequirements: z.array(z.string().trim().min(1).max(180)).max(6),
  summaryEvidenceIds: z.array(z.string().min(1).max(120)).max(32).optional().default([]),
  requirements: z.array(z.object({
    requirement: z.string().trim().min(1).max(180), jobQuote: z.string().trim().min(3).max(280),
    status: z.enum(['supported', 'related', 'not_found']),
    evidenceIds: z.array(z.string().min(1).max(120)).max(8),
  }).strict()).max(60).optional().default([]),
}).strict();
export type TailorPatch = z.infer<typeof tailorPatchSchema>;
export class TailorError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'TailorError'; }
}
export function resolveTailorSource(active: CVProfile, profiles: CVProfile[]) {
  let source = active;
  const visited = new Set<string>();
  while (source.tailoring) {
    if (visited.has(source.profileId)) return { source: active, missingOriginal: true };
    visited.add(source.profileId);
    const parent = profiles.find(p => p.profileId === source.tailoring!.sourceProfileId);
    if (!parent) return { source: active, missingOriginal: true };
    source = parent;
  }
  return { source, missingOriginal: false };
}
// Only recognized professional extra sections are eligible. Arbitrary/private
// notes and the import snapshot never become source evidence automatically.
export function professionalContext(profile: CVProfile) {
  const aliases = new Set(['languages','languageskills','volunteering','volunteerexperience','awards','achievements','publications','courses','coursework','academiccoursework','المقرراتالدراسية','interests','اللغات','العملالتطوعي','الجوائز','الانجازات','الدورات','المنشورات']);
  const rows: {id:string; section:string; text:string}[] = [];
  let contextLength = 0;
  for (const section of profile.customSections ?? []) {
    const title = section.title.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/[\s:]+/g, '');
    if (!aliases.has(title)) continue;
    const texts = [...section.paragraphs, ...(section.entries ?? []).map(e => [e.title,e.organization,e.startDate,e.endDate,e.description].filter(Boolean).join(' · '))];
    texts.forEach((text,index) => {
      contextLength += text.length;
      if(contextLength > 12000) throw new TailorError('input','Professional extra sections exceed the 12,000-character context budget. Use a focused source copy; nothing was sent.');
      // Keep the professional meaning while making omissions explicit. Raw
      // snapshots/private sections are still ineligible; contact/link spans are
      // never evidence. No URL is opened and source data is never mutated.
      const safe = text
        .replace(/(?:https?:\/\/|www\.|(?:linkedin|github)\.com\/)[^\s<>]+/giu, '[link omitted]')
        .replace(/\[([^\]\n]*)\]\(\[link omitted\]\)?/gu, '$1 [link omitted]')
        .replace(/[^\s<>()\[\]]*@[^\s<>()\[\]]*/gu, '[contact omitted]')
        .replace(/\+?\d[\d ()-]{5,}\d/g, (value: string, offset: number, whole: string) => {
          const before = whole.slice(0, offset), after = whole.slice(offset + value.length);
          // Explicit standards and measurement units are professional meaning,
          // not phone evidence merely because their digit count is high.
          const standard = /\bISO(?:\/IEC)?\s*$/i.test(before);
          const metric = /^\s*(?:records?|rows?|requests?|transactions?|users?|items?|samples?|bytes?|events?|سجل|سجلات|طلبات|معاملات)(?=\b|\s|[.,;؛]|$)/iu.test(after);
          const labelled = /(?:\b(?:phone|mobile|tel|telephone|call|contact|whatsapp)(?:\s+(?:me|at))*|الهاتف|هاتف|الجوال|اتصل|للتواصل)\s*[:：( -]*$/iu.test(before);
          if (labelled || value.startsWith('+') || value.startsWith('00')) return '[contact omitted]';
          if (standard || metric) return value;
          if ((value.match(/\d/g)?.length ?? 0) < 9 && !value.startsWith('+') ) return value;
          // There is no warning channel in Source. Fail visibly without sending
          // an ambiguous number or silently changing a possible qualification.
          throw new TailorError('input', 'A professional extra section contains an ambiguous contact-like number. Review it in the editor; the original is unchanged and nothing was sent.');
        })
        .trim();
      // Contact-only rows are not qualifications. Preserve other wording,
      // including negatives, dates and explicit course-only limitations.
      const substance = safe.replace(/\[(?:link|contact) omitted\]/g, '')
        .replace(/\b(?:email|e-mail|phone|call|tel|mobile|linkedin|github|website|portfolio)\b/giu, '')
        .replace(/(?:البريد الإلكتروني|البريد الالكتروني|الهاتف|رابط|للتواصل)/gu, '');
      if (!/[\p{L}\p{N}]/u.test(substance)) return;
      rows.push({id:`${section.id}:${index}`,section:section.title,text:safe});
    });
  }
  return rows;
}
export function professionalPayload(profile: CVProfile) {
  const supporting=supportingEvidenceSchema.safeParse(profile.supportingEvidence??[]);
  if(!supporting.success)throw new TailorError('input','Supporting evidence is invalid or exceeds its limits. Nothing was sent.');
  return {
    supportingEvidence:supporting.data.map(e=>({id:e.id,title:e.title,task:e.task,tools:e.tools,outcome:e.outcome,provenance:e.provenance})),
    headline: profile.resumeHeader.data.desiredJobPosition?.trim() || profile.headline.data,
    summary: { text: profile.summary.data, locked: profile.summary.isLocked },
    skills: { locked: profile.skills.isLocked, items: profile.skills.data.map(s => ({ id: s.id, name: s.name, category: s.category, level: s.level })) },
    experience: { locked: profile.experience.isLocked, items: profile.experience.data.map(e => ({
      id: e.id, role: e.roleTitle, company: e.companyName, start: e.startDate, end: e.endDate,
      overview: e.description ?? '', bullets: e.bullets.map(b => ({ id: b.id, text: b.text })),
    })) },
    projects: { locked: profile.projects.isLocked, items: profile.projects.data.map(p => ({
      id: p.id, name: p.name, role: p.role ?? '', bullets: p.bullets.map(b => ({ id: b.id, text: b.text })),
    })) },
    education: profile.education.data.map(e => ({ id:e.id, degree: e.degree, institution: e.institution, graduation:e.graduationDate || e.endDate, gpa:e.gpa, details:e.description, honors:e.honors, start:e.startDate })),
    certifications: profile.certifications.data.map(c => ({ id:c.id, name: c.name, issuer: c.issuer, date:c.date })),
    context: professionalContext(profile),
  };
}
export type SourceEvidence = { id: string; label: string; text: string };
export function evidenceCatalog(profile: CVProfile): Map<string, SourceEvidence> {
  const p = professionalPayload(profile); const map = new Map<string,SourceEvidence>();
  const add = (id:string,label:string,text:string) => { if (!text.trim()) return; if (map.has(id)) throw new TailorError('input','Duplicate source identifiers. Use a clean source copy before tailoring.'); map.set(id,{id,label,text}); };
  for(const e of p.supportingEvidence) add(e.id,'User-confirmed account (not independently verified)',[e.title,e.task,e.tools,e.outcome].join(' · '));
  add('headline','Headline',p.headline); add('summary','Professional summary',p.summary.text);
  for (const item of p.skills.items) add(item.id,'Skill',[item.name,item.level].filter(Boolean).join(' · '));
  for (const item of p.experience.items) {
    // Role/organization/overview evidence does not authorize borrowing a bullet.
    add(item.id,'Work role', [item.role,item.company,item.start,item.end,item.overview].filter(Boolean).join(' · '));
    for (const bullet of item.bullets) add(bullet.id,'Work achievement',bullet.text);
  }
  for (const item of p.projects.items) { add(item.id,'Project',[item.name,item.role].filter(Boolean).join(' · ')); for(const bullet of item.bullets) add(bullet.id,'Project achievement',bullet.text); }
  for (const item of p.education) add(item.id,'Education',[item.degree,item.institution,item.graduation,item.gpa,item.details,...(item.honors??[])].filter(Boolean).join(' · '));
  for (const item of p.certifications) add(item.id,'Certification',[item.name,item.issuer,item.date].filter(Boolean).join(' · '));
  for (const item of p.context) add(item.id,item.section,item.text);
  return map;
}
export function prepareTailorInput(profile: CVProfile, job: string) {
  const description = job.trim();
  if (description.length < 60) throw new TailorError('input', 'Paste a fuller job description (at least 60 characters).');
  if (description.length > JOB_LIMIT) throw new TailorError('input', 'Keep the job description within 24,000 characters.');
  if (!profile.summary.data.trim() && !profile.experience.data.some(e => e.description?.trim() || e.bullets.some(b => b.text.trim())) && !profile.projects.data.some(p => p.bullets.some(b => b.text.trim())) && !(profile.supportingEvidence??[]).length) {
    throw new TailorError('input', 'Add a summary, role overview or experience/project achievements before tailoring.');
  }
  if (profile.summary.isLocked && profile.experience.isLocked && profile.projects.isLocked && profile.skills.isLocked) throw new TailorError('input', 'All tailoring sections are locked. Unlock a relevant section before sending a request.');
  const payload = professionalPayload(profile);
  const source = JSON.stringify(payload);
  evidenceCatalog(profile);
  if (source.length > SOURCE_LIMIT) throw new TailorError('input', 'This resume is too long for the current request budget. Use a focused source copy; nothing has been sent.');
  return { payload, job: description };
}
// Only these fields are sent. Names/contact fields, photos, design, custom
// notes and private app metadata are deliberately not serialized. Known
// professional extra sections are now included as read-only context.
export function inputSignature(profile: CVProfile, job: string) {
  return JSON.stringify([TAILOR_VERSION, professionalPayload(profile), job.trim()]);
}
function metrics(text: string) {
  return (text.normalize('NFKC').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).match(/[$€£]?\d+(?:[,.]\d+)*(?:\s?(?:%|[kKmMbB]\b|\+))?/g) ?? [])
    .map(v => v.replace(/\s/g, '').toLowerCase()).sort();
}
function normalized(text: string) { return text.toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, ' ').trim(); }
const protectedTerms = ['numpy','scipy','pandas','sympy','jupyter','coding agents','scientific','quantitative','research','physics','chemistry','biology','robotics','scientist','simulations','reproducible','validated','evaluated','tested','react','typescript','javascript','python','java','php','laravel','angular','vue','next.js','node.js','kubernetes','docker','aws','azure','gcp','sql','mysql','postgresql','mongodb','flutter','swift','kotlin','rust','golang','c++','c#','tensorflow','pytorch','scrum','agile','german','french','spanish','arabic','english'];
const escapeRE = (text:string) => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function hasTerm(text:string,term:string) { return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRE(term)}(?=$|[^\\p{L}\\p{N}])`,'iu').test(text); }
function extraGrounding(after:string,context:string,summary:boolean) {
  for (const family of [['led','lead','managed','manager','directed','headed'],['mentored','trained','training','coached'],['owned','ownership'],['architected','architect','architecture']]) {
    if(family.some(term=>hasTerm(after,term)) && !family.some(term=>hasTerm(context,term))) return false;
  }
  if(summary && /in progress|expected|pursuing|قيد الدراسة|متوقع/i.test(context) && /bachelor|b\.?sc\.?|master|ph\.?d|degree|بكالوريوس|ماجستير|دكتوراه/i.test(after) && !/in progress|expected|pursuing|student|قيد الدراسة|متوقع|طالب/i.test(after)) return false;
  for(const term of protectedTerms) if(hasTerm(after,term) && !hasTerm(context,term)) return false;
  for(const term of ['senior','principal','staff','expert','advanced','fluent','native','certified','director']) if(hasTerm(after,term) && !hasTerm(context,term)) return false;
  const units = /\d+(?:[,.]\d+)*\s*(?:years?|months?|weeks?|days?|engineers?|developers?|people|clients?|users?|customers?|projects?|سنة|سنوات|اشهر|أشهر|موظف|موظفين|عميل|عملاء|مهندس|مهندسين|مطور|مطورين|مستخدم|مستخدمين|مشروع|مشاريع)(?=$|[^\p{L}\p{N}])/giu;
  const latinDigits=(v:string)=>v.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660));
  const unitsInContext = (latinDigits(context).match(units) ?? []).map(v=>normalized(v));
  if ((latinDigits(after).match(units) ?? []).some(v=>!unitsInContext.includes(normalized(v)))) return false;
  return true;
}
function grounded(before: string, after: string, context: string, summary = false, compositionMode=false) {
  const issue=wordingIssue(before,after,context);
  if (/<\/?[a-z][^>]*>/i.test(after) || !extraGrounding(after,context,summary) || issue&&(!compositionMode||!issue.startsWith('New wording'))) return false;
  const oldMetrics = metrics(summary ? context : before);
  const newMetrics = metrics(after);
  // Bullet rewrites must retain every numeric token. A summary can select
  // existing numbers, but cannot introduce a new one.
  if (summary ? newMetrics.some(n => !oldMetrics.includes(n)) : JSON.stringify(oldMetrics) !== JSON.stringify(newMetrics) || metricScopeIssue(before,after)) return false;
  return true;
}
export function compositionIssue(before:string,after:string,evidence:SourceEvidence[],summary=false):string|undefined {
  const context=evidence.map(e=>e.text).join(' ');
  if(summary&&(/\b(?:practical|hands[ -]on|proficien(?:t|cy))\b/i.test(after)&&!evidence.some(e=>['Work achievement','Project achievement','Professional summary','User-confirmed account (not independently verified)'].includes(e.label))||skillPracticeIssue(after,evidence)))return 'A skill listing was promoted to practical experience without cited work evidence.';
  if(!grounded(before,after,context,summary,true))return wordingIssue(before,after,context)?.startsWith('New wording')?'The proposal failed number, qualification, scope or protected-claim checks.':wordingIssue(before,after,context)??'The proposal failed number, qualification, scope or protected-claim checks.';
}
export type TailorChange = { area: 'summary' | 'experience' | 'projects' | 'skills' | 'skill_groups' | 'bullet_order'; entryId?: string; bulletId?: string; before: string; after: string; textField?:'description'; origin?: 'ai' | 'source_based'; planRefs?:number[]; explanation?:string; qualityNote?:string; skillOperation?:'grouping' };
export function invalidTailorFormat(error: z.ZodError): TailorError {
    // Diagnostic metadata only. Never interpolate issue.message, received values,
    // unrecognized keys, prompts, source content or the raw provider response.
    const safeFields = new Set(['jobTitle','company','summary','bullets','section','entryId','bulletId','text','jobQuote','skillOrder','bulletOrder','bulletIds','missingRequirements','summaryEvidenceIds','requirements','requirement','status','evidenceIds','contentPlan','target','intent','skillGroups','category','skillIds']);
    const issues = error.issues.slice(0, 4).map(issue => {
      let path = '';
      for (const part of issue.path) {
        if (typeof part === 'number' && Number.isSafeInteger(part) && part >= 0) path += `[${part}]`;
        else path += `${path ? '.' : ''}${typeof part === 'string' && safeFields.has(part) ? part : 'field'}`;
      }
      let constraint = '';
      if (issue.code === 'too_big') constraint = `; max ${issue.maximum}`;
      else if (issue.code === 'too_small') constraint = `; min ${issue.minimum}`;
      else if (issue.code === 'invalid_string' && issue.validation === 'uuid') constraint = '; UUID required';
      else if (issue.code === 'invalid_type') constraint = `; expected ${issue.expected}, received ${issue.received}`;
      return `${path || 'response'} (${issue.code}${constraint})`;
    });
    const more = error.issues.length > 4 ? `; +${error.issues.length - 4} more` : '';
    return new TailorError('invalid', `The AI response did not match the required format. No resume was changed. Format check: ${issues.join('; ')}${more}. Share this diagnostic, not your API key or raw response.`);
}
export function applyTailorPatch(source: CVProfile, raw: unknown, job?: string, options: { requirePlan?: boolean; requireContentPlan?:boolean; compositionMode?:boolean } = {}) {
  const parsed = tailorPatchSchema.safeParse(raw);
  if (!parsed.success) {
    throw invalidTailorFormat(parsed.error);
  }
  const patch = parsed.data;
  const copy: CVProfile = JSON.parse(JSON.stringify(source));
  const changes: TailorChange[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const catalog = evidenceCatalog(source);
  const summaryEvidence: SourceEvidence[] = [];
  const rejected: { area: 'summary' | 'experience' | 'projects'; before: string; proposed: string; reason: string }[] = [];
  const reject = (area: 'summary' | 'experience' | 'projects', before: string, proposed: string, reason: string) => {
    if (before === proposed) return;
    rejected.push({ area, before, proposed, reason }); warnings.push(reason);
  };
  const requirements: {requirement:string; jobQuote:string; status:'supported'|'related'|'not_found'; evidence:SourceEvidence[]}[] = [];
  const quotes = new Set<string>();
  const quoteKey = (v:string) => v.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  for(const row of patch.requirements) {
    const q=quoteKey(row.jobQuote); const ids=row.evidenceIds;
    if(!job || !quoteKey(options.compositionMode?job.replace(/<[^>]*>/g,''):job).includes(q) || quotes.has(q) || /<\/?[a-z][^>]*>/i.test(row.requirement+row.jobQuote) || new Set(ids).size!==ids.length || ids.some(id=>!catalog.has(id)) || (row.status==='not_found' ? !!ids.length : !ids.length)) {
      warnings.push('An incomplete or invalid requirement assessment was omitted. Review the job description directly.'); continue;
    }
    const evidence = ids.map(id=>catalog.get(id)!);
    let status = row.status;
    const text = evidence.map(e=>e.text).join(' ');
    const anchors = ['python','numpy','scipy','pandas','sympy','jupyter','coding agents','scientific','quantitative','mathematics','physics','chemistry','biology','robotics','research','reference solutions','german','fluent','native','php','laravel','react','typescript'];
    const requiredAnchors=anchors.filter(term=>hasTerm(row.jobQuote,term));
    const missingAnchor=/\bor\b|أو/iu.test(row.jobQuote)?requiredAnchors.length>0&&!requiredAnchors.some(term=>hasTerm(text,term)):requiredAnchors.some(term=>!hasTerm(text,term));
    if (status === 'supported' && (missingAnchor || (/practical|hands[ -]on|experience|proficiency/i.test(row.jobQuote) && !evidence.some(e=>['Work achievement','Project achievement','User-confirmed account (not independently verified)'].includes(e.label))))) {
      status = 'related'; warnings.push('A direct-evidence label was downgraded: an explicit requirement term was not present in the cited source.');
    }
    quotes.add(q); requirements.push({requirement:row.requirement,jobQuote:row.jobQuote,status,evidence});
  }
  if (options.requirePlan && !requirements.length) throw new TailorError('invalid', 'No valid job-evidence plan was returned. Your source is unchanged; no automatic retry was made.');
  const checkedPlan=checkContentPlan(source,patch,requirements,catalog),contentPlan=checkedPlan.plan;
  if(checkedPlan.omitted)warnings.push(`Content plan omitted: ${checkedPlan.omitted} item(s) had invalid source, scope, quote or repeated links. No evidence was guessed.`);
  if(options.requireContentPlan&&!contentPlan.length)warnings.push('No checked content plan was returned. Wording, skill grouping and order proposals are not available; the job assessment may still be reviewed.');
  const planned=(target:'summary'|'experience'|'projects'|'skills',entryId='',bulletId='')=>!options.requireContentPlan||planLinks(contentPlan,target,entryId,bulletId).length>0;
  const linked = (quote: string) => !!job && requirements.some(r => quoteKey(r.jobQuote) === quoteKey(quote) && r.status !== 'not_found');
  for (const item of patch.bullets) {
    const key = `${item.section}:${item.entryId}:${item.bulletId}`;
    if (seen.has(key)) throw new TailorError('invalid', 'The response contained duplicate changes. No resume was changed.');
    seen.add(key);
    const section = copy[item.section];
    const entry = section.data.find(e => e.id === item.entryId);
    const bullet = entry?.bullets.find(b => b.id === item.bulletId);
    if (!entry || !bullet) throw new TailorError('invalid', 'The response referenced content outside this resume. No resume was changed.');
    if (section.isLocked) { reject(item.section, bullet.text, item.text, 'A suggestion targeted a locked section and was kept unchanged.'); continue; }
    if ((options.requirePlan || item.jobQuote) && !linked(item.jobQuote)) {
      reject(item.section, bullet.text, item.text, 'A wording suggestion had no valid link to the job-evidence plan.'); continue;
    }
    if(!planned(item.section,item.entryId,item.bulletId)||options.requireContentPlan&&!contentPlan.some(p=>p.target===item.section&&p.entryId===item.entryId&&p.bulletId===item.bulletId&&quoteKey(p.jobQuote)===quoteKey(item.jobQuote))){reject(item.section,bullet.text,item.text,'A wording suggestion had no checked content-plan link to its original passage and job requirement.');continue;}
    const context = item.section === 'experience'
      ? `${bullet.text} ${source.experience.data.find(e => e.id === entry.id)?.roleTitle ?? ''} ${source.experience.data.find(e => e.id === entry.id)?.companyName ?? ''}`
      : `${bullet.text} ${source.projects.data.find(e => e.id === entry.id)?.name ?? ''} ${source.projects.data.find(e => e.id === entry.id)?.role ?? ''}`;
    if (!grounded(bullet.text, item.text, context,false,options.compositionMode)) {
      reject(item.section, bullet.text, item.text, wordingIssue(bullet.text, item.text, context) ?? 'A suggestion failed the fact, qualification, number or technology checks.'); continue;
    }
    if (bullet.text !== item.text) {
      changes.push({ area: item.section, entryId: entry.id, bulletId: bullet.id, before: bullet.text, after: item.text });
      bullet.text = item.text; bullet.isVerified = false;
    }
  }
  if (patch.summary && patch.summary !== source.summary.data) {
    if (source.summary.isLocked) reject('summary', source.summary.data, patch.summary, 'The locked summary was kept unchanged.');
    else if(options.requireContentPlan&&!summaryPlanned(contentPlan,patch.summaryEvidenceIds))reject('summary',source.summary.data,patch.summary,'The summary was not covered by a checked content plan. No sources were guessed.');
    else {
      const ids=patch.summaryEvidenceIds;
      if (!ids.length || new Set(ids).size!==ids.length || ids.some(id=>!catalog.has(id))) reject('summary', source.summary.data, patch.summary, `Summary references invalid: ${ids.length ? 0 : 1} missing list, ${ids.length-new Set(ids).size} repeated reference(s), ${ids.filter(id=>!catalog.has(id)).length} unknown reference(s). The summary was not applied; no sources were guessed.`);
      else {
        const cited=ids.map(id=>catalog.get(id)!);
        if(skillPracticeIssue(patch.summary,cited)) reject('summary', source.summary.data, patch.summary, 'A listed skill was presented as practical work experience without cited work evidence.');
        else if(!grounded(source.summary.data,patch.summary,cited.map(e=>e.text).join(' '),true,options.compositionMode)) reject('summary', source.summary.data, patch.summary, 'The proposed summary failed checks against its cited evidence; review the cited facts and wording.');
        else { changes.push({area:'summary',before:source.summary.data,after:patch.summary}); copy.summary.data=patch.summary; summaryEvidence.push(...cited); }
      }
    }
  }
  const skillIds = new Set(source.skills.data.map(s=>s.id));
  const repeatedSkills = patch.skillOrder.length - new Set(patch.skillOrder).size;
  const unknownSkills = patch.skillOrder.filter(id=>!skillIds.has(id)).length;
  if (repeatedSkills || unknownSkills) {
    // Fail closed for the entire ordering suggestion, not unrelated checked wording.
    // Never repair IDs, substitute names or partially apply an invalid order.
    warnings.push(`Skill order omitted: ${repeatedSkills} repeated ID(s), ${unknownSkills} ID(s) outside the source skill list. Original skills and order kept; other checked suggestions still require your review.`);
    patch.skillOrder = [];
  }
  if (patch.skillOrder.length && !source.skills.isLocked && planned('skills')) {
    const ordered = [...patch.skillOrder.map(id => copy.skills.data.find(s => s.id === id)!), ...copy.skills.data.filter(s => !patch.skillOrder.includes(s.id))];
    if (ordered.map(s => s.id).join() !== source.skills.data.map(s => s.id).join()) {
      changes.push({ area: 'skills', before: source.skills.data.map(s => s.name).join(', '), after: ordered.map(s => s.name).join(', ') });
      copy.skills.data = ordered;
    }
  }
  if(patch.skillOrder.length&&!planned('skills'))warnings.push('Skill order omitted: no checked content plan. Original order kept.');
  const groupIds=patch.skillGroups.flatMap(g=>g.skillIds),groupCategories=patch.skillGroups.map(g=>g.category);
  if(patch.skillGroups.length){
    const valid=!source.skills.isLocked&&planned('skills')&&new Set(groupCategories).size===groupCategories.length&&new Set(groupIds).size===groupIds.length&&groupIds.length===source.skills.data.length&&groupIds.every(id=>skillIds.has(id));
    if(!valid)warnings.push('Skill grouping omitted: groups must preserve every original skill exactly once, use existing categories and have a checked plan.');
    else {const categories=new Map(patch.skillGroups.flatMap(g=>g.skillIds.map(id=>[id,g.category] as const))),before=source.skills.data.map(s=>`${s.category}: ${s.name}`).join('\n');
      if(source.skills.data.some(s=>s.category!==categories.get(s.id))){copy.skills.data=copy.skills.data.map(s=>({...s,category:categories.get(s.id)!}));changes.push({area:'skill_groups',before,after:source.skills.data.map(s=>`${categories.get(s.id)}: ${s.name}`).join('\n')});}
    }
  }
  const orderedEntries = new Set<string>();
  for (const order of patch.bulletOrder) {
    const key = `${order.section}:${order.entryId}`;
    if (orderedEntries.has(key)) throw new TailorError('invalid', 'Duplicate achievement ordering. No resume was changed.');
    orderedEntries.add(key);
    const section = copy[order.section]; const entry = section.data.find(e=>e.id===order.entryId);
    if (!entry || new Set(order.bulletIds).size !== order.bulletIds.length || order.bulletIds.length !== entry.bullets.length || order.bulletIds.some(id=>!entry.bullets.some(b=>b.id===id))) {
      throw new TailorError('invalid', 'Achievement order must preserve every bullet in its original entry. No resume was changed.');
    }
    if (section.isLocked || !linked(order.jobQuote) || !planned(order.section,order.entryId) || options.requireContentPlan&&!contentPlan.some(p=>p.target===order.section&&p.entryId===order.entryId&&quoteKey(p.jobQuote)===quoteKey(order.jobQuote))) { warnings.push('An achievement order was not applied: locked section or missing job-evidence link.'); continue; }
    if (entry.bullets.map(b=>b.id).join() === order.bulletIds.join()) continue;
    const before = entry.bullets.map(b=>b.text).join('\n');
    entry.bullets = order.bulletIds.map(id=>entry.bullets.find(b=>b.id===id)!);
    changes.push({area:'bullet_order',entryId:entry.id,before,after:entry.bullets.map(b=>b.text).join('\n')});
  }
  // No entries/sections/skills are deleted. Names, titles, dates, photo,
  // custom sections, layout and design remain exactly those of the source.
  const proposedWording = patch.bullets.filter(b => {
    const entry = source[b.section].data.find(e=>e.id===b.entryId);
    return entry?.bullets.find(v=>v.id===b.bulletId)?.text !== b.text;
  }).length + (patch.summary && patch.summary !== source.summary.data ? 1 : 0);
  const appliedWording = changes.filter(c=>['summary','experience','projects'].includes(c.area)).length;
  const review = { proposedWording, appliedWording, rejectedWording: rejected.length,
    skillsReordered: changes.some(c=>c.area==='skills'), achievementOrders: changes.filter(c=>c.area==='bullet_order').length, rejected };
  for(const change of changes){const target=change.area==='skills'||change.area==='skill_groups'?'skills':change.area==='bullet_order'?(source.experience.data.some(e=>e.id===change.entryId)?'experience':'projects'):change.area;change.planRefs=planLinks(contentPlan,target,change.entryId,change.bulletId);if(['experience','projects'].includes(change.area)&&limitedWordingChange(change.before,change.after))change.qualityNote='Limited wording change: mainly a leading-word substitution. Review whether this adds value.';}
  if(options.compositionMode)for(const change of changes.filter(c=>['summary','experience','projects'].includes(c.area))){
    const context=change.area==='summary'?summaryEvidence.map(e=>e.text).join(' '):change.before;
    if(wordingIssue(change.before,change.after,context)?.startsWith('New wording'))change.qualityNote='Review wording: this uses new phrasing. Source references and rule checks are not factual or semantic verification.';
  }
  return { copy, patch, changes, contentPlan, requirements, summaryEvidence, review, warnings: [...new Set(warnings)] };
}
export function validateNewCopy(copy: CVProfile) {
  if (!cvProfileSchema.safeParse(copy).success) throw new TailorError('invalid', 'The new resume could not be validated. Your existing resumes are unchanged.');
}
export type SummaryAlternative = { text: string; evidence: SourceEvidence[]; explanation: string };
export function checkedSummaryAlternative(source: CVProfile, result: ReturnType<typeof applyTailorPatch>): SummaryAlternative | undefined {
  if (result.review.rejected.some(r=>r.reason.includes('checked content plan'))) return;
  if (source.summary.isLocked || !result.review.rejected.some(r=>r.area==='summary')) return;
  const ids=result.patch.summaryEvidenceIds, catalog=evidenceCatalog(source);
  if(!ids.length || new Set(ids).size!==ids.length || ids.some(id=>!catalog.has(id))) return;
  const cited=ids.map(id=>catalog.get(id)!); const context=cited.map(e=>e.text).join(' ');
  const sentences=result.patch.summary.split(/(?<=[.!?؛])\s+/u).map(s=>s.trim()).filter(Boolean);
  const kept=sentences.filter(s=>!skillPracticeIssue(s,cited) && grounded(source.summary.data,s,context,true)).slice(0,2);
  const skillIds=new Set(cited.filter(e=>e.label==='Skill').map(e=>e.id));
  const preferred=[...result.patch.skillOrder,...source.skills.data.map(s=>s.id)];
  const used=new Set<string>(); const skillNames:string[]=[];
  for(const id of preferred) {
    if(!skillIds.has(id)||used.has(id)) continue;
    used.add(id); const name=source.skills.data.find(s=>s.id===id)?.name;
    if(name && !kept.some(s=>normalized(s).includes(normalized(name)))) skillNames.push(name);
    if(skillNames.length===6) break;
  }
  if(skillNames.length) kept.push(`Skills include ${skillNames.join(', ')}.`);
  const text=kept.join(' ');
  // No raw editing of an unsupported clause, no added claims, no extra call.
  // Non-English summaries are not given an English fallback automatically.
  if(!text || text===source.summary.data || text.length>1800 || [...source.summary.data].some(c=>/\p{L}/u.test(c)&&!/\p{Script=Latin}/u.test(c)) || !/\b(?:and|with|the|I|for|through|using)\b/i.test(source.summary.data) || skillPracticeIssue(text,cited) || !grounded(source.summary.data,text,context,true)) return;
  return {text,evidence:cited,explanation:'Locally prepared from checked sentences and cited skill listings. Unsupported sentences were omitted. This is not a second AI response or factual verification; choose it only after review.'};
}
