import { v4 as uuid } from 'uuid';
import { reconcileHeaderEducation } from './cvImportEducation';
import { isOriginalSkillSectionHeading, isOriginalSkillGroupHeading } from './contentEngine/skillContext';
import { cvProfileSchema, type CVProfile, type DocumentTheme, type CustomResumeSection } from '@/types/schema';

export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const IMPORT_MAX_TEXT = 100000;
export const IMPORT_MAX_PAGES = 30;
export class CVImportError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'CVImportError'; }
}
export type ImportFormat = 'pdf' | 'docx';
export interface ImportRegion { page: number; lane: 'left' | 'right' | 'full'; text: string }
export interface ExtractedCV { text: string; warnings: string[]; pages?: number; regions?: ImportRegion[] }
export function importFormat(name: string, size: number): ImportFormat {
  if (!size) throw new CVImportError('empty', 'This file is empty. Choose a PDF or DOCX resume.');
  if (size > IMPORT_MAX_BYTES) throw new CVImportError('size', 'Choose a file smaller than 10 MB. No resume was created.');
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext !== 'pdf' && ext !== 'docx') throw new CVImportError('format', 'Choose a PDF or DOCX file. Images and older .doc files are not supported.');
  return ext;
}
export function cleanImportText(value: string) {
  // Preserve line breaks and source spelling; strip only control/formatting artifacts.
  return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\u200b\ufeff]/g, '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}
export function validateImportText(value: string) {
  const text = cleanImportText(value);
  if (text.length > IMPORT_MAX_TEXT) throw new CVImportError('length', 'The extracted text is too long (limit: 100,000 characters). Nothing was imported.');
  if ((text.match(/[\p{L}\p{N}]/gu) || []).length < 20) throw new CVImportError('text', 'Not enough readable text was found. Scanned/image-only PDFs need OCR. Try a text PDF or DOCX instead.');
  if ((text.match(/\ufffd/g) || []).length > Math.max(5, text.length / 40)) throw new CVImportError('encoding', 'The file text could not be decoded reliably. Export another text PDF or DOCX.');
  return text;
}
const stripBullet = (s: string) => s.replace(/^\s*[•●▪◦‣–—*-]\s+/, '').trim();
const isBullet = (s: string) => /^\s*[•●▪◦‣–—*-]\s+/.test(s);
const key = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/[\u064b-\u065f]/g, '').replace(/[:：\s]+$/g, '').replace(/\s+/g, ' ').trim();
type Section = 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'languages' | 'other';
const headingNames: Record<Exclude<Section, 'other'>, string[]> = {
  summary: ['summary','professional summary','profile','professional profile','objective','career objective','about me','نبذة','نبذة شخصية','الملخص المهني','ملخص','الهدف المهني'],
  experience: ['experience','work experience','professional experience','employment','employment history','work history','الخبرات','الخبرة المهنية','الخبرات المهنية','الخبرات العملية','الخبرة العملية'],
  education: ['education','academic background','education and qualifications','التعليم','المؤهلات العلمية','المؤهلات الاكاديمية'],
  skills: ['skills','technical skills','core skills','core competencies','expertise','key skills','competencies','business & management competencies','business and management competencies','المهارات','المهارات التقنية','المهارات الفنية'],
  projects: ['projects','selected projects','personal projects','academic projects','المشاريع','المشروعات','المشاريع الاكاديمية'],
  certifications: ['certifications','certificates','licenses and certifications','الشهادات','الشهادات المهنية','الدورات والشهادات'],
  languages: ['languages','language skills','اللغات'],
};
const compactKey = (value: string) => key(value).replace(/\s+/g, '');
function heading(line: string): { section: Section | 'header'; title: string; inline?: string } | undefined {
  const colon = line.indexOf(':');
  const original = colon >= 0 ? line.slice(0, colon) : line;
  if (original.length > 100) return;
  const candidate = compactKey(original);
  if (['contact','contactdetails','contactinformation','personal details','بيانات التواصل','معلومات الاتصال'].some(v => compactKey(v) === candidate)) return { section: 'header', title: 'Contact', inline: colon >= 0 ? line.slice(colon + 1).trim() : undefined };
  for (const [section, aliases] of Object.entries(headingNames)) {
    const alias = aliases.find(v => compactKey(v) === candidate);
    if (alias) return { section: section as Section, title: key(original) === key(alias) ? original : alias.toUpperCase(), inline: colon >= 0 ? line.slice(colon + 1).trim() : undefined };
  }
  if (isOriginalSkillSectionHeading(original)) return { section: 'skills', title: original, inline: colon >= 0 ? line.slice(colon + 1).trim() : undefined };
  const other = ['private notes','personal notes','notes','private','ملاحظات خاصة','ملاحظات شخصية','ملاحظات','coursework','academic coursework','المقررات الدراسية','imported footer','imported notes','awards','volunteering','volunteer experience','interests','courses','references','publications','additional information','achievements','الدورات','الجوائز','الاهتمامات','المراجع','العمل التطوعي','الانجازات'].find(v => compactKey(v) === candidate);
  if (other) return { section: 'other', title: key(original) === key(other) ? original : other.toUpperCase(), inline: colon >= 0 ? line.slice(colon + 1).trim() : undefined };
}
const dateToken = '(?:(?:[A-Za-z]{3,9}\\.?|[\\u0600-\\u06ff]+)\\s+)?(?:19|20)\\d{2}|\\d{1,2}[/.](?:19|20)\\d{2}|Present|Current|Now|حتى الآن|حاليا|الان|الآن';
const range = new RegExp(`(${dateToken})\\s*(?:[-–—]|\\bto\\b|إلى|الى)\\s*(${dateToken})`, 'i');
export function extractImportDates(line: string): { rest: string; start: string; end: string } {
  const m = range.exec(line);
  if (!m) return { rest: line, start: '', end: '' };
  return { rest: line.replace(m[0], '').replace(/^[\s|·,]+|[\s|·,]+$/g, '').trim(), start: m[1].trim(), end: m[2].trim() };
}
function chunks(lines: string[]): string[][] {
  const result: string[][] = []; let part: string[] = []; let sawBullet = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) { if (part.length) { result.push(part); part = []; sawBullet = false; } continue; }
    if (part.length && sawBullet && !isBullet(line) && (extractImportDates(line).start || (/engineer|developer|manager|designer|analyst|specialist|مهندس|مطور|مدير/i.test(line) && lines.slice(index, index + 3).some(x => extractImportDates(x).start)))) { result.push(part); part = []; sawBullet = false; }
    part.push(line); sawBullet ||= isBullet(line);
  }
  if (part.length) result.push(part);
  // A blank line after a title or within a paragraph does not create a fictional job.
  return result;
}
// PDF extraction may place a blank line after every physical line. Keep the
// original chunk boundaries unless fragments form ONE explicit dated identity.
// This does not infer missing employers/degrees or collapse arbitrary whitespace.
function structuredChunks(lines: string[], kind: 'experience' | 'education'): string[][] {
  const groups = chunks(lines), output: string[][] = [];
  const role = /engineer|developer|manager|designer|analyst|specialist|consultant|intern|مهندس|مطور|مدير|محلل|متدرب/i;
  const degree = /\b(?:bachelor|master|ph\.?d|doctor|diploma|associate|b\.?sc|m\.?sc|mba|b\.?s\.?|m\.?s\.?|b\.?a\.?)\b|بكالوريوس|ماجستير|دكتوراه|دبلوم|ثانوية/i;
  const datedIdentity = (part: string[]) => {
    const bullet = part.findIndex(isBullet), heads = (bullet < 0 ? part : part.slice(0, bullet)).filter(x => x.trim());
    if (!heads.length || heads.length > 4) return false;
    let dates = 0;
    const labels = heads.map(line => {
      const ranges = [...line.matchAll(new RegExp(range.source, 'gi'))];
      if (ranges.length) { dates += ranges.length; return extractImportDates(line).rest; }
      if (kind === 'education') {
        if (singleDate(line)) { dates++; return ''; }
        const expected = /(?:\s*\|\s*|\s+)((?:Expected|Anticipated)\s+(?:19|20)\d{2})$/i.exec(line);
        if (expected) { dates++; return line.slice(0, expected.index).trim(); }
      }
      return line;
    }).filter(Boolean);
    if (dates !== 1 || !labels.length || labels.length > 2) return false;
    const identities = labels.length === 1 ? splitPair(labels[0]) : labels;
    if (identities.length !== 2 || (labels.length === 2 && labels.some(s => splitPair(s).length !== 1))) return false;
    const pattern = kind === 'experience' ? role : degree;
    // Exactly one recognizable role/degree and one other identity label. Two
    // recognizable titles are ambiguous, not permission to merge two entries.
    return identities.filter(s => pattern.test(s)).length === 1;
  };
  for (let i = 0; i < groups.length; i++) {
    let combined = [...groups[i]], end = i;
    while (!datedIdentity(combined) && end + 1 < groups.length && end - i < 3 && !combined.some(isBullet) && combined.length < 4) {
      const next = groups[end + 1];
      // A paired identity is a fresh candidate, never continuation of another.
      if (splitPair(extractImportDates(next[0] || '').rest).length > 1) break;
      combined = combined.concat(next); end++;
    }
    if (!datedIdentity(combined)) { output.push(groups[i]); continue; }
    const next = groups[end + 1];
    // A second adjacent date before any contribution makes ownership ambiguous.
    if (!combined.some(isBullet) && next?.some(line => !!extractImportDates(line).start || (kind === 'education' && !!singleDate(line)))) {
      output.push(groups[i]); continue;
    }
    while (end + 1 < groups.length) {
      const following = groups[end + 1];
      if (kind === 'experience' ? !isBullet(following[0] || '') : !following.every(line => /^(?:Current\s+)?GPA\s*:/i.test(line))) break;
      combined = combined.concat(following); end++;
    }
    output.push(combined); i = end;
  }
  return output;
}
function joinWrapped(lines: string[]): string[] {
  const output: string[] = [];
  for (const l of lines) {
    if (!l.trim()) continue;
    if (isBullet(l) || !output.length) output.push(stripBullet(l));
    else output[output.length - 1] += ' ' + l.trim();
  }
  return output;
}
function splitPair(line: string) { return line.split(/\s+[|·]\s+|\s+at\s+|\s+@\s+/i).map(x => x.trim()).filter(Boolean); }
// Only recover decorative spacing in known month names, never infer a missing month/year.
function singleDate(value: string): string | undefined {
  const original = value.trim().replace(/^[|\s]+|[|\s]+$/g, '').replace(/(?<=\d)\s+(?=\d)/g, '');
  if (/^(?:19|20)\d{2}$/.test(original)) return original;
  if (/^(?:Expected|Anticipated|المتوقع|متوقع)\s+(?:19|20)\d{2}$/i.test(original)) return original;
  const match = /^([A-Za-z][A-Za-z .]*?)\s*((?:19|20)\d{2})$/.exec(original);
  if (!match) return;
  const month = match[1].replace(/[ .]/g, '').toLowerCase();
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec','january','february','march','april','june','july','august','september','october','november','december'];
  if (!months.includes(month)) return;
  const preserved = match[1].trim().replace(/\s+/g, '');
  return preserved + ' ' + match[2];
}
function skillItems(value: string): string[] {
  const result: string[] = []; let depth = 0; let item = '';
  for (const char of value) {
    if ('([{'.includes(char)) depth++;
    if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
    if (!depth && /[,،;；|•·]/.test(char)) { if (item.trim()) result.push(item.trim()); item = ''; }
    else item += char;
  }
  if (item.trim()) result.push(item.trim());
  return result;
}
function skillLines(lines: string[]): { text: string; label: string }[] {
  const result: { text: string; label: string }[] = []; let wrapped: { text: string; label: string } | undefined;
  let lastPhysical = '';
  const atom = (s: string) => /^[\p{L}\p{N}][\p{L}\p{N}+#./_-]*$/u.test(s.trim());
  const openQualifier = (s: string) => [...s].reduce((depth, c) => depth + ('([{'.includes(c) ? 1 : ')]}'.includes(c) ? -1 : 0), 0) > 0;
  const flush = () => { if (wrapped?.text.trim()) result.push(wrapped); wrapped = undefined; };
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    const raw = stripBullet(line);
    if (isOriginalSkillGroupHeading(raw)) { flush(); wrapped = { text: '', label: raw }; lastPhysical = ''; continue; }
    const labelled = /^([^:]{1,75}):\s*(.*)$/.exec(raw);
    if (labelled) { flush(); wrapped = { text: labelled[2], label: labelled[1] }; lastPhysical = labelled[2]; }
    else if (wrapped && !isBullet(line)) {
      // Unpunctuated atomic list lines are distinct names, not a new compound
      // skill. Explicit open parentheses/delimiters retain genuine wrapping.
      const separator = wrapped.text && atom(lastPhysical) && atom(raw) && !openQualifier(wrapped.text) ? '; ' : ' ';
      wrapped.text += separator + raw; lastPhysical = raw;
    }
    else { flush(); result.push({ text: raw, label: '' }); }
  }
  flush(); return result;
}
function certificateGroups(lines: string[]): { lines: string[]; date: string }[] {
  const groups: { lines: string[]; date: string }[] = []; let current: string[] = [];
  const flush = (date = '') => { if (current.length) groups.push({ lines: current, date }); current = []; };
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    const date = singleDate(line);
    if (date && current.length) { flush(date); continue; }
    if (date) { groups.push({ lines: [line], date: '' }); continue; }
    if (isBullet(line)) flush();
    current.push(stripBullet(line));
  }
  flush(); return groups;
}

export function buildImportedProfile(extracted: ExtractedCV, fileName: string, format: ImportFormat, theme: DocumentTheme): CVProfile {
  const text = validateImportText(extracted.text);
  const wrap = <T,>(title: string, data: T) => ({ id: uuid(), title, data, isLocked: false });
  const p: CVProfile = { profileId: uuid(), profileName: fileName.replace(/\.(pdf|docx)$/i, '').slice(0, 100) || 'Imported resume', version: 0, lastConfirmed: '', documentTheme: { ...theme },
    resumeHeader: wrap('Resume Header', { name: '', email: '', phone: '', linkedin: '', location: '', showLocation: true, showPhone: true, showLinkedin: true, showGithub: true, showPortfolio: true, showOtherUrl: true }),
    headline: wrap('Headline', ''), summary: wrap('Professional Summary', ''), experience: wrap('Work Experience', []), education: wrap('Education', []), skills: wrap('Skills', []), projects: wrap('Projects', []), certifications: wrap('Certifications', []), customSections: [], sectionOrder: ['personal'] };
  const warnings = [...extracted.warnings];
  const custom = (title: string, lines: string[], kind: CustomResumeSection['kind'] = 'text') => {
    const paragraphs = lines.map(x => stripBullet(x)).filter(Boolean); if (!paragraphs.length) return;
    const s = { id: uuid(), title: title.slice(0, 80), kind, paragraphs };
    p.customSections!.push(s); p.sectionOrder!.push(`custom:${s.id}`);
  };
  const blocks: { section: Section | 'header'; title: string; lines: string[] }[] = [];
  const regions = extracted.regions?.length ? extracted.regions : [{ page: 1, lane: 'full' as const, text }];
  const regionText = regions.map(r => cleanImportText(r.text)).join('\n\n');
  if (extracted.regions?.length && cleanImportText(regionText) !== text) throw new CVImportError('regions', 'The reading-order snapshot is inconsistent. Nothing was imported.');
  let recoveredHeadingSpacing = false;
  for (const region of regions) {
    let current: typeof blocks[number] = { section: 'header', title: '', lines: [] }; blocks.push(current);
    for (const raw of region.text.split('\n')) {
      const line = raw.trim(); let found = line ? heading(line) : undefined;
      // A known academic subgroup inside skills is context for the following
      // skill names; outside skills it remains an editable professional section.
      if (current.section === 'skills' && found?.section === 'other' && isOriginalSkillGroupHeading(line.replace(/[:：].*$/, '').trim())) found = undefined;
      if (found) {
        recoveredHeadingSpacing ||= key(found.title) !== key(line.replace(/:.*$/, ''));
        current = { section: found.section, title: found.title, lines: found.inline ? [found.inline] : [] }; blocks.push(current);
      } else current.lines.push(line);
    }
  }
  if (recoveredHeadingSpacing) warnings.push('Decorative spacing in recognized section headings was normalized. The extraction snapshot keeps the source wording.');
  const h = p.resumeHeader.data;
  const headerBlocks = blocks.filter(b => b.section === 'header');
  const leftoverGroups: string[][] = []; let possibleHeadlineInDetails = false;
  const fieldLabels = ['email','phone','mobile','tel','github','linkedin','location','address','name','fullname','العنوان','الموقع','الاسم','البريدالالكتروني','الهاتف'];
  for (const block of headerBlocks) {
    const leftovers: string[] = []; let pendingLabel = ''; let educationContinuation = 0;
    for (const original of block.lines) {
      if (!original.trim()) { educationContinuation = 0; leftovers.push(''); continue; }
      let line = original; let removedContact = false;
      const label = compactKey(line.replace(/:$/, ''));
      if (fieldLabels.includes(label)) { educationContinuation = 0; pendingLabel = label; leftovers.push(''); continue; }
      if (['location','address','العنوان','الموقع'].includes(pendingLabel) && !h.location) { h.location = line; pendingLabel = ''; leftovers.push(''); continue; }
      pendingLabel = '';
      const email = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
      if (email && !h.email) { h.email = email; line = line.replace(email, ''); removedContact = true; }
      const phone = line.match(/(?:\+?\d[\d ()-]{7,}\d)/)?.[0];
      if (phone && (phone.match(/\d/g) || []).length >= 8 && !h.phone) { h.phone = phone.trim(); line = line.replace(phone, ''); removedContact = true; }
      for (const match of [...line.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/|github\.com\/)[^\s|·,]+/gi)]) {
        const value = match[0]; if (/linkedin/i.test(value) && !h.linkedin) h.linkedin = value; else if (/github/i.test(value) && !h.github) h.github = value; else continue;
        line = line.replace(value, ''); removedContact = true;
      }
      line = line.replace(/\b(?:email|phone|mobile|linkedin|github|tel)\s*:/gi, '').replace(/^[\s|·,;]+|[\s|·,;]+$/g, '').trim();
      if (!line || /^(?:cv|resume|curriculum vitae|السيرة الذاتية)$/i.test(line)) { educationContinuation = 0; leftovers.push(''); continue; }
      if (removedContact) { educationContinuation = 0; leftovers.push(''); }
      const degreeStart = /^(?:(?:b\.?\s*sc\.?|m\.?\s*sc\.?|b\.?s\.?|m\.?s\.?|b\.?a\.?|ph\.?d\.?|mba)(?:\s|$)|(?:bachelor|master|doctor|associate)(?:['’]s)?\s+(?:of|in|degree)(?:\s|$)|diploma\s+(?:in|of)(?:\s|$))/i.test(line);
      const educationHeader = degreeStart || educationContinuation > 0;
      if (!degreeStart && educationContinuation > 0 && h.name && !p.headline.data && /engineer|developer|manager|designer|analyst|specialist|consultant|student|مهندس|مطور|مدير|طالب|محلل|مصمم/i.test(line)) possibleHeadlineInDetails = true;
      if (degreeStart) educationContinuation = /\s+[–—|·-]\s+\S/.test(line) ? 0 : 2;
      else if (educationContinuation) educationContinuation = /\s+[–—|·-]\s+\S/.test(line) ? 0 : educationContinuation - 1;
      if (!educationHeader && !h.name && /^[\p{L}][\p{L}\p{M} .’'-]{2,85}$/u.test(line) && line.split(/\s+/).length >= 2 && line.split(/\s+/).length <= 7 && !/engineer|developer|manager|designer|analyst|مهندس|مطور|مدير/i.test(line)) { h.name = line; leftovers.push(''); }
      else if (!educationHeader && h.name && !p.headline.data && /engineer|developer|manager|designer|analyst|specialist|consultant|student|مهندس|مطور|مدير|طالب|محلل|مصمم/i.test(line) && line.length <= 130) { p.headline.data = line; h.desiredJobPosition = line; leftovers.push(''); }
      else if (/^(?:location|address|العنوان|الموقع)\s*:/i.test(line) && !h.location) { h.location = line.replace(/^[^:]+:\s*/, ''); leftovers.push(''); }
      else leftovers.push(line);
      if (removedContact) leftovers.push('');
    }
    leftoverGroups.push(leftovers);
  }
  if (!h.name) warnings.push('Your name could not be identified confidently. Add it in Personal details before exporting.');
  const preserve = (title: string, lines: string[]) => { custom(title, lines); warnings.push(`Some ${title.toLowerCase()} could not be mapped confidently and were kept as an editable section.`); };
  for (const block of blocks.filter(b => b.section !== 'header')) {
    const { section, lines } = block; const title = block.title;
    if (section !== 'other' && section !== 'languages' && !p.sectionOrder!.includes(section)) p.sectionOrder!.push(section);
    if (section === 'summary') { p.summary.data = [p.summary.data, lines.filter(Boolean).map(stripBullet).join(' ')].filter(Boolean).join('\n\n'); }
    else if (section === 'skills') {
      for (const {text: raw, label} of skillLines(lines)) {
        const category = /business|management|soft|ادار/i.test(title + ' ' + label) ? 'Soft' as const : /tools|ادوات/i.test(label) ? 'Tools' as const : 'Technical' as const;
        for (const name of skillItems(raw)) if (!p.skills.data.some(item => key(item.name) === key(name))) p.skills.data.push({ id: uuid(), name, category });
      }
    } else if (section === 'experience') {
      for (const group of structuredChunks(lines, 'experience')) {
        const bulletIndex = group.findIndex(isBullet); const heads = (bulletIndex >= 0 ? group.slice(0, bulletIndex) : group).filter(Boolean);
        const first = extractImportDates(heads[0] || ''); let start = first.start, end = first.end;
        const otherHeads: string[] = [];
        for (const line of heads.slice(1)) { const d = extractImportDates(line); if (!start && d.start) { start = d.start; end = d.end; } if (d.rest) otherHeads.push(d.rest); }
        const pair = splitPair(first.rest);
        let role = pair[0] || ''; let company = pair[1] || (otherHeads.length === 1 ? otherHeads[0] : '');
        const rolePattern = /engineer|developer|manager|designer|analyst|specialist|consultant|intern|مهندس|مطور|مدير|محلل|متدرب/i;
        if (!rolePattern.test(role) && rolePattern.test(company)) [role, company] = [company, role];
        if (!role || !company || heads.length > 4 || (bulletIndex < 0 && !start)) { preserve(title, group); continue; }
        const bullets = bulletIndex >= 0 ? joinWrapped(group.slice(bulletIndex)) : [];
        p.experience.data.push({ id: uuid(), roleTitle: role, companyName: company, startDate: start, endDate: end, description: pair.length > 2 ? pair.slice(2).join(' · ') : otherHeads.filter(x => x !== company && x !== role).join('\n'), bullets: bullets.map(text => ({ id: uuid(), text, isVerified: false })) });
      }
    } else if (section === 'education') {
      for (const group of structuredChunks(lines, 'education')) {
        let graduationDate = ''; let gpa = '';
        const ds = group.map(line => {
          const metric = /^(?:Current\s+)?GPA\s*:\s*(.+)$/i.exec(line);
          if (metric) { gpa = metric[1].trim(); return {rest:'',start:'',end:''}; }
          const range = extractImportDates(line);
          if (range.start) return range;
          const expected = /(?:\s*\|\s*|\s+)((?:Expected|Anticipated)\s+(?:19|20)\d{2})$/i.exec(line);
          if (expected) { graduationDate = expected[1]; return {rest:line.slice(0, expected.index).trim(),start:'',end:''}; }
          const standalone = singleDate(line);
          if (standalone) { graduationDate = standalone; return {rest:'',start:'',end:''}; }
          return range;
        });
        const date = ds.find(item => item.start); const rest = ds.map(item => item.rest).filter(Boolean);
        const pair = splitPair(rest[0] || ''); let degree = pair[0] || ''; let institution = pair[1] || rest[1] || '';
        const degreePattern = /\b(?:bachelor|master|ph\.?d|doctor|diploma|associate|b\.?sc|m\.?sc|mba|b\.?s\.?|m\.?s\.?|b\.?a\.?)\b|بكالوريوس|ماجستير|دكتوراه|دبلوم|ثانوية/i;
        if (!degreePattern.test(degree) && degreePattern.test(institution)) [degree, institution] = [institution, degree];
        // A wrapped, unclosed qualifier cannot safely be treated as an
        // institution line. Keep the whole group editable for manual review.
        if (!degree || !institution || !degreePattern.test(degree) || /(?:\([^)]*$|\[[^\]]*$|\{[^}]*$|\b(?:in|of|and)\s*$)/i.test(degree) || /^[\[(]?\s*(?:in progress|ongoing|current|currently enrolled|part[ -]time|full[ -]time)\s*[\])]?$/i.test(institution)) { preserve(title, group); continue; }
        p.education.data.push({ id: uuid(), degree, institution, startDate: date?.start || '', endDate: date?.end || graduationDate, graduationDate: graduationDate || undefined, gpa: gpa || undefined, description: rest.slice(pair.length > 1 ? 1 : 2).join('\n') });
      }
    } else if (section === 'projects') {
      for (const group of chunks(lines)) {
        if (!group[0] || isBullet(group[0])) { preserve(title, group); continue; }
        const pair = splitPair(group[0]); const name = pair[0];
        p.projects.data.push({ id: uuid(), name, role: pair.slice(1).join(' · '), bullets: joinWrapped(group.slice(1)).map(text => ({ id: uuid(), text, isVerified: false })) });
      }
    } else if (section === 'certifications') {
      for (const group of certificateGroups(lines)) {
        const pair = splitPair(group.lines.join(' '));
        if (!pair[0] || singleDate(pair[0])) { preserve(title, group.lines); continue; }
        // An absent issuer stays empty. A dash inside a title is NOT evidence of an issuer.
        p.certifications.data.push({ id: uuid(), name: pair[0], issuer: pair.slice(1).join(' · '), date: group.date });
      }
    } else custom(title, lines, section === 'languages' ? 'skills' : 'text');
  }
  // Resolve header repetitions only after all education sections are parsed.
  // No source text is rewritten: the full extraction remains in importedFrom.
  const unresolved: string[] = []; let matchedHeaderEducation = 0, statusReviewNeeded = false;
  for (const group of leftoverGroups) {
    const result = reconcileHeaderEducation(group, p.education.data);
    unresolved.push(...result.remaining); matchedHeaderEducation += result.matches.length; statusReviewNeeded ||= result.statusReviewNeeded;
  }
  if (unresolved.length) custom('Imported details', unresolved);
  if (statusReviewNeeded) warnings.push('An education status may need review. Compare Education and Imported details before removing any text.');
  if (possibleHeadlineInDetails) warnings.push('A line near a degree may be a job headline. Review Imported details and Headline.');
  if (matchedHeaderEducation) warnings.push(`${matchedHeaderEducation} repeated header education statement(s) matched a unique Education entry and were not added again to Imported details. Original text is retained in the import snapshot.`);
  if (/[\u0600-\u06ff\u4e00-\u9fff]/.test(text)) warnings.push('Non-Latin text is kept for editing. This release still needs dedicated fonts/shaping for non-Latin PDF export.');
  warnings.push('Check names, dates and section placement. Local extraction does not verify facts; images and the original page design are not imported.');
  p.importedFrom = { fileName: fileName.slice(0, 240), format, importedAt: new Date().toISOString(), sourceText: text, warnings: [...new Set(warnings)], pages: extracted.pages };
  return cvProfileSchema.parse(p);
}
