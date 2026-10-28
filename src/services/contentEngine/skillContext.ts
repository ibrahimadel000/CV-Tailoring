import type { CVProfile } from '@/types/schema';
export type SkillContext = { sectionTitle: string; groupTitle: string; skillIds: string[] };
const key = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
const headingKey = (s: string) => key(s).replace(/[أإآ]/g, 'ا').replace(/[\s:：]+/g, '');
const skillHeadings = new Set(['skills', 'technical skills', 'core skills', 'core competencies', 'key skills', 'expertise', 'competencies', 'business & management competencies', 'business and management competencies', 'المهارات', 'المهارات التقنية', 'المهارات الفنية'].map(headingKey));
const groupHeadings = new Set(['AI, Machine Learning & Data','Backend Development','Frontend & Mobile','Databases & Systems','Core Engineering & Methods','Product & Operations','Growth & Communication','Programming Languages','Languages','Frameworks','Libraries','Databases','Tools','Platforms','Methods','Technical','Soft','Interpersonal','Coursework','Coursework only','Academic coursework','Introductory coursework','Self study','Self-study','المقررات الدراسية','مقررات دراسية','دراسة ذاتية','المهارات التقنية','لغات البرمجة','قواعد البيانات','الأدوات','الخبرات التقنية'].map(headingKey));
const stopHeadings = new Set(['profile','summary','professional summary','experience','work experience','professional experience','employment','education','academic background','projects','selected projects','certifications','certificates','languages','contact','contact details','contact information','awards','interests','publications','private notes','notes','additional information','references','التعليم','الخبرات','الخبرات العملية','اللغات','الشهادات','المشاريع','معلومات الاتصال','ملاحظات'].map(headingKey));
// Recover only bounded, recognized headings. Arbitrary snapshot labels (including
// private notes) must never be promoted to professional context.
const qualifierHeadings = new Set(['coursework', 'coursework only', 'academic only', 'introductory', 'introductory course only', 'basic', 'beginner', 'self taught', 'self-taught', 'self study', 'self-study', 'not professional practice', 'مقررات فقط', 'مقررات دراسية', 'مستوى تمهيدي', 'دراسة ذاتية'].map(headingKey));
function recognizedHeading(label: string, headings: Set<string>) {
  if (label.length > 120) return false; // fail neutral rather than truncate a limit
  if (headings.has(headingKey(label))) return true;
  const qualified = /^(.+?)\s*[（(]([^()（）]+)[）)]$/u.exec(label);
  return !!qualified && headings.has(headingKey(qualified[1])) && qualifierHeadings.has(headingKey(qualified[2]));
}
export const isOriginalSkillSectionHeading = (label: string) => recognizedHeading(label, skillHeadings);
export const isOriginalSkillGroupHeading = (label: string) => recognizedHeading(label, groupHeadings);
function tokens(text: string) {
  const out: string[] = []; let depth = 0, token = '';
  for (const c of text) {
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
    if (!depth && /[,،;؛；|·•▪●\n]/u.test(c)) { if (token.trim()) out.push(key(token)); token = ''; } else token += c;
  }
  if (token.trim()) out.push(key(token)); return new Set(out);
}
// Local, conservative recovery from an existing extraction snapshot. No snapshot is
// transmitted. Only headings inside recognized skills sections with exact current
// skill-name matches may leave this function. This does not reconstruct the PDF.
export function originalSkillContext(profile: CVProfile): SkillContext[] {
  const text = profile.importedFrom?.sourceText;
  if (!text || text.length > 100000) return [];
  const groups: { sectionTitle: string; groupTitle: string; text: string }[] = [];
  let section = '', group: typeof groups[number] | undefined;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const value = line.replace(/^\s*[•▪●*-]\s*/, '').trim(); if (!value) continue;
    const colon = value.search(/[:：]/u), label = colon < 0 ? value : value.slice(0, colon).trim();
    const h = headingKey(label);
    if (isOriginalSkillSectionHeading(label)) { section = label; group = undefined; if (colon >= 0 && value.slice(colon + 1).trim()) { group = { sectionTitle: section, groupTitle: '', text: value.slice(colon + 1) }; groups.push(group); } continue; }
    if (stopHeadings.has(h)) { section = ''; group = undefined; continue; }
    if (!section) continue;
    if (isOriginalSkillGroupHeading(label)) {
      group = { sectionTitle: section, groupTitle: label, text: colon >= 0 ? value.slice(colon + 1) : '' }; groups.push(group); continue;
    }
    if (colon >= 0) { section = ''; group = undefined; continue; }
    // An unknown standalone heading is a boundary, not permission to scan notes.
    if (colon < 0 && !profile.skills.data.some(s => key(s.name) === key(value)) && /^[A-Z][A-Z &/–—-]{3,99}$/u.test(value)) { section = ''; group = undefined; continue; }
    if (!group) { group = { sectionTitle: section, groupTitle: '', text: '' }; groups.push(group); }
    const singleSkill = profile.skills.data.some(s => key(s.name) === key(value));
    group.text += singleSkill ? ';' + value + ';' : ' ' + value;
  }
  return groups.flatMap(g => {
    const values = tokens(g.text), skillIds = profile.skills.data.flatMap((s, i) => values.has(key(s.name)) ? [`skill_${i + 1}`] : []);
    return skillIds.length ? [{ sectionTitle: g.sectionTitle, groupTitle: g.groupTitle, skillIds }] : [];
  }).slice(0, 200);
}
