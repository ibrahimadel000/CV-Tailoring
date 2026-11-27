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
export type ImportFormat = 'pdf' | 'docx' | 'txt' | 'md' | 'image';
export interface ImportRegion { page: number; lane: 'left' | 'right' | 'full'; text: string }
export interface ExtractedImage { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
export interface ExtractedCV {
  text: string;
  warnings: string[];
  pages?: number;
  pageSize?: 'A4' | 'Letter';
  regions?: ImportRegion[];
  complexLayout?: boolean;
  needsAiVision?: boolean;
  images?: ExtractedImage[];
}
export function importFormat(name: string, size: number): ImportFormat {
  if (!size) throw new CVImportError('empty', 'This file is empty. Choose a PDF, DOCX, TXT, Markdown, or image resume.');
  if (size > IMPORT_MAX_BYTES) throw new CVImportError('size', 'Choose a file smaller than 10 MB. No resume was created.');
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || ext === 'docx' || ext === 'txt' || ext === 'md') return ext;
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return 'image';
  throw new CVImportError('format', 'Choose a PDF, DOCX, TXT, Markdown, or image (PNG/JPG) resume. Older .doc files can be saved as DOCX or pasted as text.');
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
  summary: ['summary','professional summary','profile','professional profile','objective','career objective','about','about me','bio','executive summary','résumé','profil','profil professionnel','à propos','über mich','kurzprofil','perfil','perfil profesional','resumen','نبذة','نبذة عني','نبذة شخصية','الملخص المهني','ملخص','الهدف المهني'],
  experience: ['experience','work experience','professional experience','employment','employment history','work history','career history','professional background','expérience','expériences','expérience professionnelle','expériences professionnelles','parcours professionnel','berufserfahrung','beruflicher werdegang','experiencia','experiencia laboral','experiencia profesional','الخبرات','الخبرة المهنية','الخبرات المهنية','الخبرات العملية','الخبرة العملية'],
  education: ['education','academic background','education and qualifications','academic qualifications','formation','formations','éducation','études','ausbildung','studium','bildung','educación','formación','formación académica','التعليم','المؤهلات العلمية','المؤهلات الاكاديمية'],
  skills: ['skills','technical skills','core skills','core competencies','expertise','key skills','competencies','tech stack','technical stack','toolkit','business & management competencies','business and management competencies','compétences','compétences techniques','savoir-faire','kenntnisse','fähigkeiten','kompetenzen','habilidades','competencias','aptitudes','المهارات','المهارات التقنية','المهارات الفنية'],
  projects: ['projects','selected projects','key projects','personal projects','academic projects','projets','projets clés','projekte','proyectos','المشاريع','المشروعات','المشاريع الاكاديمية'],
  certifications: ['certifications','certificates','licenses and certifications','licenses','credentials','certifications et diplômes','zertifikate','certificaciones','الشهادات','الشهادات المهنية','الدورات والشهادات'],
  languages: ['languages','language skills','langues','sprachen','idiomas','اللغات'],
};
const compactKey = (value: string) => key(value).replace(/\s+/g, '');
function heading(line: string): { section: Section | 'header'; title: string; inline?: string } | undefined {
  const colon = line.search(/[:：]/);
  const rawHead = colon >= 0 ? line.slice(0, colon) : line;
  const original = rawHead.replace(/^(?:\d{1,2}[.)]\s*|[—–•▪■◆►▸|]+\s*)/, '').replace(/\s*[—–•▪■◆|]+$/, '').trim();
  if (!original || original.length > 100) return;
  const candidate = compactKey(original);
  if (['contact','contactdetails','contactinformation','personal details','بيانات التواصل','معلومات الاتصال'].some(v => compactKey(v) === candidate)) return { section: 'header', title: 'Contact', inline: colon >= 0 ? line.slice(colon + 1).trim() : undefined };
  for (const [section, aliases] of Object.entries(headingNames)) {
    const alias = aliases.find(v => compactKey(v) === candidate);
    if (alias) return { section: section as Section, title: key(original) === key(alias) ? original : alias.toUpperCase(), inline: colon >= 0 ? line.slice(colon + 1).trim() : undefined };
  }
  if (isOriginalSkillSectionHeading(original)) return { section: 'skills', title: original, inline: colon >= 0 ? line.slice(colon + 1).trim() : undefined };
  const other = ['private notes','personal notes','notes','private','ملاحظات خاصة','ملاحظات شخصية','ملاحظات','coursework','academic coursework','المقررات الدراسية','imported footer','imported notes','awards','volunteering','volunteer experience','interests','courses','references','publications','additional information','achievements','skills & experience','skills and experience','core competencies & experience','key skills & experience','الدورات','الجوائز','الاهتمامات','المراجع','العمل التطوعي','الانجازات'].find(v => compactKey(v) === candidate);
  if (other) return { section: 'other', title: key(original) === key(other) ? original : other.toUpperCase(), inline: colon >= 0 ? line.slice(colon + 1).trim() : undefined };
}
const dateToken = '(?:(?:[A-Za-z]{3,9}\\.?|[\\u0600-\\u06ff]+)\\s+)?(?:19|20)\\d{2}|\\d{1,2}[/.](?:19|20)\\d{2}|Present|Current|Now|حتى الآن|حاليا|الان|الآن';
const range = new RegExp(`(${dateToken})\\s*(?:[-–—]|\\bto\\b|إلى|الى)\\s*(${dateToken})`, 'i');
const normalizeDigits = (value: string) => value.replace(/[\u0660-\u0669]/g, ch => String(ch.charCodeAt(0) - 0x0660));
export function extractImportDates(line: string): { rest: string; start: string; end: string } {
  const normalized = normalizeDigits(line);
  const m = range.exec(normalized);
  if (!m) return { rest: line, start: '', end: '' };
  return { rest: normalized.replace(m[0], '').replace(/^[\s|·,/]+|[\s|·,/]+$/g, '').trim(), start: m[1].trim(), end: m[2].trim() };
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
  const role = /\b(?:engineer|developer|manager|designer|analyst|specialist|consultant|intern|architect|director|lead|principal|founder|co-founder|researcher|scientist|accountant|auditor|lawyer|nurse|doctor|pharmacist|teacher|professor|coordinator|administrator|executive|officer|technician|product\s+owner|scrum\s+master|trainer|teaching\s+assistant|head\s+of\s+[a-z]+|instructor|lecturer|supervisor|advisor)\b|مهندس|مطور|مدير|محلل|متدرب|باحث|محاسب|طبيب|أستاذ|منسق|رئيس/i;
  const degree = /\b(?:bachelor|master|ph\.?d|doctor|diploma|associate|b\.?sc|m\.?sc|b\.?eng|m\.?eng|b\.?tech|m\.?tech|bba|bfa|llb|mba|md|jd|high\s+school|b\.?s\.?|m\.?s\.?|b\.?a\.?)\b|بكالوريوس|ماجستير|دكتوراه|دبلوم|ثانوية/i;
  const datedIdentity = (part: string[]) => {
    const bullet = part.findIndex(isBullet), heads = (bullet < 0 ? part : part.slice(0, bullet)).filter(x => x.trim());
    if (!heads.length || heads.length > 4) return false;
    let dates = 0;
    const labels: string[] = [];
    for (const line of heads) {
      const normalized = normalizeDigits(line);
      const ranges = [...normalized.matchAll(new RegExp(range.source, 'gi'))];
      if (ranges.length) {
        dates += ranges.length;
        const r = extractImportDates(line).rest;
        if (r) labels.push(r);
        continue;
      }
      if (kind === 'education') {
        if (singleDate(line)) { dates++; continue; }
        const expected = /(?:\s*\|\s*|\s+)((?:Expected|Anticipated)\s+(?:19|20)\d{2})$/i.exec(normalized);
        if (expected) {
          dates++;
          const r = normalized.slice(0, expected.index).trim();
          if (r) labels.push(r);
          continue;
        }
        const parts = splitPair(line, true);
        if (parts.length >= 2 && parts.some(part => Boolean(singleDate(part)))) {
          const nonDate = parts.filter(part => {
            if (singleDate(part)) { dates++; return false; }
            return true;
          });
          labels.push(...nonDate);
          continue;
        }
      }
      labels.push(line);
    }
    if (dates !== 1 || !labels.length || labels.length > 2) return false;
    const identities = labels.length === 1 ? splitPair(labels[0], kind === 'education') : labels;
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
function splitPair(line: string, allowSlash = false) { const re = allowSlash && !/[|·]/.test(line) ? /\s+[|·/]\s+|\s+at\s+|\s+@\s+/i : /\s+[|·]\s+|\s+at\s+|\s+@\s+/i; return line.split(re).map(x => x.trim()).filter(Boolean); }
// Only recover decorative spacing in known month names, never infer a missing month/year.
function singleDate(value: string): string | undefined {
  const original = normalizeDigits(value).trim().replace(/^[|\s/]+|[|\s/]+$/g, '').replace(/(?<=\d)\s+(?=\d)/g, '');
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
    const stripped = stripBullet(line);
    const inlineParts = stripped.split(/\s*\|\s*/).map(x => x.trim()).filter(Boolean);
    if (inlineParts.length >= 2) {
      const tailDate = singleDate(inlineParts[inlineParts.length - 1]);
      if (tailDate) {
        flush();
        groups.push({ lines: [inlineParts.slice(0, -1).join(' | ')], date: tailDate });
        continue;
      }
    }
    if (isBullet(line)) flush();
    current.push(stripped);
  }
  flush(); return groups;
}

export function buildImportedProfile(extracted: ExtractedCV, fileName: string, format: ImportFormat, theme: DocumentTheme): CVProfile {
  const text = validateImportText(extracted.text);
  const wrap = <T,>(title: string, data: T) => ({ id: uuid(), title, data, isLocked: false });
  const p: CVProfile = { profileId: uuid(), profileName: fileName.replace(/\.(pdf|docx|txt|md|png|jpe?g|webp)$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 100) || 'Imported resume', version: 0, lastConfirmed: '', documentTheme: { ...theme, ...(extracted.pageSize ? { pageSize: extracted.pageSize } : {}) },
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
  const lastSectionByLane = new Map<'left' | 'right' | 'full', { section: Section | 'header'; title: string }>();
  for (const region of regions) {
    const prevLane = region.page > 1 ? lastSectionByLane.get(region.lane) : undefined;
    let current: typeof blocks[number] =
      prevLane && prevLane.section !== 'header'
        ? { section: prevLane.section, title: prevLane.title, lines: [] }
        : { section: 'header', title: '', lines: [] };
    blocks.push(current);
    for (const raw of region.text.split('\n')) {
      const line = raw.trim(); let found = line ? heading(line) : undefined;
      // A known academic subgroup inside skills is context for the following
      // skill names; outside skills it remains an editable professional section.
      if (current.section === 'skills' && ((found?.section === 'other' && isOriginalSkillGroupHeading(line.replace(/[:：].*$/, '').trim())) || (found?.section === 'languages' && Boolean(found.inline)))) found = undefined;
      if (found) {
        recoveredHeadingSpacing ||= key(found.title) !== key(line.replace(/:.*$/, ''));
        current = { section: found.section, title: found.title, lines: found.inline ? [found.inline] : [] }; blocks.push(current);
      } else current.lines.push(line);
    }
    if (current.section !== 'header') {
      lastSectionByLane.set(region.lane, { section: current.section, title: current.title });
    }
  }
  if (recoveredHeadingSpacing) warnings.push('Decorative spacing in recognized section headings was normalized. The extraction snapshot keeps the source wording.');
  const h = p.resumeHeader.data;
  const headerBlocks = blocks.filter(b => b.section === 'header');
  const leftoverGroups: string[][] = [];
  const fieldLabels = ['email','phone','mobile','tel','github','linkedin','location','address','name','fullname','العنوان','الموقع','الاسم','البريدالالكتروني','الهاتف'];
  for (const block of headerBlocks) {
    const leftovers: string[] = []; let pendingLabel = '';
    for (const original of block.lines.filter(Boolean)) {
      let line = original;
      const label = compactKey(line.replace(/:$/, ''));
      if (fieldLabels.includes(label)) { pendingLabel = label; continue; }
      if (['location','address','العنوان','الموقع'].includes(pendingLabel) && !h.location) { h.location = line; pendingLabel = ''; continue; }
      pendingLabel = '';
      const email = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
      if (email && !h.email) { h.email = email; line = line.replace(email, ''); }
      const phone = line.match(/(?:\+?\d[\d ()-]{7,}\d)/)?.[0];
      if (phone && (phone.match(/\d/g) || []).length >= 8 && !h.phone) { h.phone = phone.trim(); line = line.replace(phone, ''); }
      for (const match of [...line.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/|github\.com\/)[^\s|·,]+/gi)]) {
        const value = match[0]; if (/linkedin/i.test(value) && !h.linkedin) h.linkedin = value; else if (/github/i.test(value) && !h.github) h.github = value; else continue;
        line = line.replace(value, '');
      }
      for (const match of [...line.matchAll(/(?:https?:\/\/|www\.)[^\s|·,]+/gi)]) {
        const value = match[0];
        if (!h.portfolio) h.portfolio = value;
        else if (!h.otherUrl) h.otherUrl = value;
        else continue;
        line = line.replace(value, '');
      }
      line = line.replace(/(?:\b(?:email|phone|mobile|linkedin|github|portfolio|website|tel)|الهاتف|الجوال|البريد\s+الإلكتروني|البريد\s+الالكتروني)\s*[:：]/gi, '').replace(/^[\s|·,;]+|[\s|·,;]+$/g, '').trim();
      if (!line || /^(?:cv|resume|curriculum vitae|السيرة الذاتية)$/i.test(line)) continue;
      if (!h.name && /^[\p{L}][\p{L}\p{M} .’'-]{2,85}$/u.test(line) && line.split(/\s+/).length >= 2 && line.split(/\s+/).length <= 7 && !/engineer|developer|manager|designer|analyst|مهندس|مطور|مدير/i.test(line)) {
        h.name = line;
        const parts = line.split(/\s+/);
        h.firstName = parts[0];
        h.lastName = parts.slice(1).join(' ');
      }
      else if (h.name && !p.headline.data && /\b(?:engineer|developer|manager|designer|analyst|specialist|consultant|student|architect|director|lead|principal|founder|researcher|scientist|accountant|coordinator|product\s+owner)\b|مهندس|مطور|مدير|طالب|محلل|مصمم|باحث|محاسب/i.test(line) && line.length <= 130) { p.headline.data = line; h.desiredJobPosition = line; }
      else if (/^(?:location|address|العنوان|الموقع)\s*:/i.test(line) && !h.location) h.location = line.replace(/^[^:]+:\s*/, '');
      else leftovers.push(line);
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
        const ctx = `${title} ${label}`;
        const category = /business|management|soft|interpersonal|ادار/i.test(ctx)
          ? 'Soft' as const
          : /languages?|اللغات/i.test(ctx)
            ? 'Languages' as const
            : /tools|ادوات/i.test(label)
              ? 'Tools' as const
              : 'Technical' as const;
        for (const rawItem of skillItems(raw)) {
          const levelMatch = /^(.+?)\s+[—–]\s+(.+)$/.exec(rawItem);
          const name = (levelMatch ? levelMatch[1] : rawItem).trim();
          const level = levelMatch ? levelMatch[2].trim() : undefined;
          if (name && !p.skills.data.some(item => key(item.name) === key(name))) {
            p.skills.data.push({ id: uuid(), name, category, ...(level ? { level } : {}) });
          }
        }
      }
    } else if (section === 'experience') {
      for (const group of structuredChunks(lines, 'experience')) {
        const bulletIndex = group.findIndex(isBullet); const heads = (bulletIndex >= 0 ? group.slice(0, bulletIndex) : group).filter(Boolean);
        const first = extractImportDates(heads[0] || ''); let start = first.start, end = first.end;
        const otherHeads: string[] = [];
        for (const line of heads.slice(1)) { const d = extractImportDates(line); if (!start && d.start) { start = d.start; end = d.end; } if (d.rest) otherHeads.push(d.rest); }
        const pair = splitPair(first.rest);
        const rolePattern = /\b(?:engineer|developer|manager|designer|analyst|specialist|consultant|intern|architect|director|lead|principal|founder|co-founder|researcher|scientist|accountant|auditor|lawyer|nurse|doctor|pharmacist|teacher|professor|coordinator|administrator|executive|officer|technician|product\s+owner|scrum\s+master|trainer|teaching\s+assistant|head\s+of\s+[a-z]+|instructor|lecturer|supervisor|advisor)\b|مهندس|مطور|مدير|محلل|متدرب|باحث|محاسب|طبيب|أستاذ|منسق|رئيس/i;
        const looksLikeProse = (line: string) =>
          line.length > 70 ||
          /[.!?]$/.test(line.trim()) ||
          /^(?:i\s+|responsible|managed|led|built|developed|worked|created|designed|implemented|assisted|trained|oversaw|coordinated)\b/i.test(line.trim());
        let role = pair[0] || '';
        const canPromoteOther0 =
          !pair[1] &&
          otherHeads.length >= 1 &&
          (otherHeads.length === 1 || (!rolePattern.test(role) && rolePattern.test(otherHeads[0])) || !looksLikeProse(otherHeads[0]));
        let company = pair[1] || (canPromoteOther0 ? otherHeads[0] : '');
        let city = '';
        const consumedOther = canPromoteOther0 ? 0 : -1;
        if (!rolePattern.test(role) && rolePattern.test(company)) [role, company] = [company, role];
        // Split trailing city from "Web Developer, Sana'a" while sparing "Manager, Product Operations"
        const deptNoun = /\b(?:operations|engineering|backend|frontend|full[- ]?stack|product|finance|marketing|sales|infrastructure|data|hr|human\s+resources|security|cybersecurity|cloud|devops|design|analytics|research|support|it|platform|systems|mobile|web|ai|ml|strategy|growth|legal|compliance)\b/i;
        const roleComma = /^(.+?)[,،]\s*([\p{L}][\p{L} .'-]{1,32})$/u.exec(role);
        if (
          roleComma &&
          rolePattern.test(roleComma[1]) &&
          !rolePattern.test(roleComma[2]) &&
          !deptNoun.test(roleComma[2]) &&
          roleComma[2].trim().split(/\s+/).length <= 3
        ) {
          role = roleComma[1].trim();
          city = roleComma[2].trim();
        }
        if (!role || !company || heads.length > 5 || (bulletIndex < 0 && !start)) { preserve(title, group); continue; }
        const bullets = bulletIndex >= 0 ? joinWrapped(group.slice(bulletIndex)) : [];
        const remainingDesc = otherHeads.filter((_, idx) => idx !== consumedOther).join('\n');
        p.experience.data.push({ id: uuid(), roleTitle: role, companyName: company, ...(city ? { city } : {}), startDate: start, endDate: end, description: pair.length > 2 ? pair.slice(2).join(' · ') : remainingDesc, bullets: bullets.map(text => ({ id: uuid(), text, isVerified: false })) });
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
        const rawParts = rest.flatMap(line => splitPair(line, true));
        const nonDateParts: string[] = [];
        for (const part of rawParts) {
          const maybeDate = singleDate(part);
          if (maybeDate && !graduationDate && !date?.start) {
            graduationDate = maybeDate;
          } else {
            nonDateParts.push(part);
          }
        }
        let degree = nonDateParts[0] || ''; let institution = nonDateParts[1] || '';
        let descParts = nonDateParts.slice(2);
        const degreePattern = /\b(?:bachelor|master|ph\.?d|doctor|diploma|associate|b\.?sc|m\.?sc|b\.?eng|m\.?eng|b\.?tech|m\.?tech|bba|bfa|llb|mba|md|jd|high\s+school|b\.?s\.?|m\.?s\.?|b\.?a\.?)\b|بكالوريوس|ماجستير|دكتوراه|دبلوم|ثانوية/i;
        if (!degreePattern.test(degree) && degreePattern.test(institution)) [degree, institution] = [institution, degree];
        if (!degreePattern.test(degree) && descParts.length && degreePattern.test(descParts[0])) {
          const prevDegree = degree;
          degree = descParts[0];
          descParts = descParts.slice(1);
          if (prevDegree && !degree.toLowerCase().includes(prevDegree.toLowerCase())) {
            descParts = [prevDegree, ...descParts];
          }
        }
        if (!degree || !institution || !degreePattern.test(degree)) { preserve(title, group); continue; }
        p.education.data.push({ id: uuid(), degree, institution, startDate: date?.start || '', endDate: date?.end || graduationDate, graduationDate: graduationDate || undefined, gpa: gpa || undefined, description: descParts.join('\n') });
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
  const unresolved: string[] = []; let matchedHeaderEducation = 0;
  for (const group of leftoverGroups) {
    const result = reconcileHeaderEducation(group, p.education.data);
    unresolved.push(...result.remaining); matchedHeaderEducation += result.matches.length;
  }
  if (unresolved.length) custom('Imported details', unresolved);
  if (matchedHeaderEducation) warnings.push(`${matchedHeaderEducation} repeated header education statement(s) matched a unique Education entry and were not added again to Imported details. Original text is retained in the import snapshot.`);
  if (/[\u0600-\u06ff\u4e00-\u9fff]/.test(text)) warnings.push('Non-Latin text is kept for editing. This release still needs dedicated fonts/shaping for non-Latin PDF export.');
  warnings.push('Check names, dates and section placement. Local extraction does not verify facts; images and the original page design are not imported.');
  p.importedFrom = { fileName: fileName.slice(0, 240), format, importedAt: new Date().toISOString(), sourceText: text, warnings: [...new Set(warnings)], pages: extracted.pages };
  return cvProfileSchema.parse(p);
}

export interface ImportQualityAssessment {
  needsAiFallback: boolean;
  reason?: string;
  mappedCount: number;
  unmappedLines: number;
}

export function assessImportQuality(profile: CVProfile, extracted: ExtractedCV): ImportQualityAssessment {
  if (extracted.needsAiVision) {
    return { needsAiFallback: true, reason: 'scanned-or-image', mappedCount: 0, unmappedLines: 0 };
  }
  const customSections = profile.customSections ?? [];
  const mappedCount =
    profile.experience.data.length +
    profile.education.data.length +
    profile.skills.data.length +
    profile.projects.data.length +
    profile.certifications.data.length +
    customSections.filter(c => c.title.trim().toLowerCase() !== 'imported details').length;

  const importedDetails = customSections.find(c => c.title.trim().toLowerCase() === 'imported details');
  const unmappedLines = importedDetails ? importedDetails.paragraphs.length : 0;
  const totalLines = Math.max(1, extracted.text.split('\n').filter(l => l.trim()).length);
  const unmappedRatio = unmappedLines / totalLines;

  if (extracted.complexLayout) {
    return { needsAiFallback: true, reason: 'complex-floating-layout', mappedCount, unmappedLines };
  }
  if (mappedCount === 0) {
    return { needsAiFallback: true, reason: 'no-sections-mapped', mappedCount, unmappedLines };
  }
  const hasExpHeading = /(?:^|\n)\s*(?:(?:work|professional)\s+experience|experience|employment(?:\s+history)?|الخبرات(?:\s+(?:المهنية|العملية))?)\s*:?\s*(?:\n|$)/i.test(extracted.text);
  if (hasExpHeading && profile.experience.data.length === 0) {
    return { needsAiFallback: true, reason: 'experience-unstructured', mappedCount, unmappedLines };
  }
  const duplicateBuiltIn = customSections.some(c =>
    /^(?:experience|work experience|professional experience|education|skills)$/i.test(c.title.trim()),
  );
  if (duplicateBuiltIn) {
    return { needsAiFallback: true, reason: 'duplicate-builtin-section', mappedCount, unmappedLines };
  }
  if (profile.skills.data.some(s => s.name.length > 55 && !/\([^)]+\)/.test(s.name))) {
    return { needsAiFallback: true, reason: 'sentence-in-skills', mappedCount, unmappedLines };
  }
  if (unmappedLines >= 6 && unmappedRatio > 0.22) {
    return { needsAiFallback: true, reason: 'high-unmapped-ratio', mappedCount, unmappedLines };
  }
  return { needsAiFallback: false, mappedCount, unmappedLines };
}
