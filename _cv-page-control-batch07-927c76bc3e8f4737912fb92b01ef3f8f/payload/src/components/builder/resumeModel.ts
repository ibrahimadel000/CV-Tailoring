import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';

export type BuiltInSectionId = 'personal' | 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications';
export type SectionId = BuiltInSectionId | `custom:${string}`;
export const sections: { id: BuiltInSectionId; title: string; description: string; hint: string }[] = [
  { id: 'personal', title: 'Personal details', description: 'Make it easy to get in touch.', hint: 'Use a professional email address and only include links you want to share.' },
  { id: 'summary', title: 'Professional summary', description: 'A short introduction. A strong first impression.', hint: 'Aim for 2–4 sentences: your role, your strengths, and the value you bring. Keep it factual.' },
  { id: 'experience', title: 'Work experience', description: 'Tell the story of the work you’ve done.', hint: 'Start with your most recent role. Describe your contribution and use numbers only when they are accurate.' },
  { id: 'education', title: 'Education', description: 'Your learning, qualifications, and achievements.', hint: 'New to the workforce? Education, coursework, and projects can show what you are capable of.' },
  { id: 'skills', title: 'Skills', description: 'The tools and abilities you actually use.', hint: 'Keep this relevant and specific. Separate skills with commas to add several at once.' },
  { id: 'projects', title: 'Projects', description: 'Show what you can build, lead, or deliver.', hint: 'Include personal, academic, or professional projects. Explain your role and the outcome.' },
  { id: 'certifications', title: 'Certifications', description: 'Credentials that support your experience.', hint: 'Include the credential name, issuing organization, and date. This section is optional.' },
];
export function plainText(value = ''): string {
  // Older editors stored lightweight Markdown. Export visible text, never HTML.
  return value.replace(/<[^>]*>/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/_([^_\n]+)_/g, '$1').trim();
}
export function fullName(p: CVProfile): string {
  const h = p.resumeHeader.data;
  const name = [h.firstName, h.lastName].filter(Boolean).join(' ').trim() || h.name.trim();
  return [name, h.showSuffixName !== false ? h.suffixName : ''].filter(Boolean).join(', ');
}
export function contacts(p: CVProfile): string[] {
  const h = p.resumeHeader.data;
  return [h.email, h.showPhone !== false ? h.phone : '', h.showLocation !== false ? h.location : '', h.showLinkedin !== false ? h.linkedin : '', h.showGithub !== false ? h.github : '', h.showPortfolio !== false ? h.portfolio : '', h.showOtherUrl !== false ? h.otherUrl : ''].filter((s): s is string => Boolean(s?.trim()));
}
export function headline(p: CVProfile): string {
  return p.resumeHeader.data.useAsHeadline !== false ? (p.resumeHeader.data.desiredJobPosition || p.headline.data) : '';
}
export function sectionCount(p: CVProfile, id: SectionId): number {
  if (id === 'personal') return fullName(p) || p.resumeHeader.data.email ? 1 : 0;
  if (id === 'summary') return p.summary.data.trim() ? 1 : 0;
  if (id.startsWith('custom:')) {
    const data = p.customSections?.find(x => `custom:${x.id}` === id);
    return data?.kind === 'experience' ? (data.entries || []).filter(e => e.title.trim() || e.organization.trim() || e.description.trim()).length : data?.paragraphs.filter(x => x.trim()).length || 0;
  }
  return p[id as Exclude<BuiltInSectionId, 'personal' | 'summary'>].data.length;
}
export function essentials(p: CVProfile) {
  return [
    { label: 'Your name', done: Boolean(fullName(p)) },
    { label: 'Contact email', done: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.resumeHeader.data.email) },
    { label: 'A short summary', done: Boolean(p.summary.data.trim()) },
    { label: 'Experience or education', done: p.experience.data.some(e => Boolean(e.roleTitle.trim() && e.companyName.trim())) || p.education.data.some(e => Boolean(e.degree.trim() && e.institution.trim())) },
    { label: 'Relevant skills', done: p.skills.data.some(s => Boolean(s.name.trim())) },
  ];
}
export interface ResumeBlock { id: SectionId; title: string; items: { entryId?: string; title?: string; subtitle?: string; date?: string; text?: string; bullets?: string[] }[] }
export function resumeBlocks(p: CVProfile): ResumeBlock[] {
  const blocks: ResumeBlock[] = [];
  if (plainText(p.summary.data)) blocks.push({ id: 'summary', title: 'Profile', items: [{ text: plainText(p.summary.data) }] });
  const experience = p.experience.data.filter(e => e.roleTitle.trim() || e.companyName.trim() || e.description?.trim() || e.bullets.some(b => b.text.trim()));
  if (experience.length) blocks.push({ id: 'experience', title: 'Experience', items: experience.map(e => ({ entryId: e.id, title: e.roleTitle, subtitle: [e.companyName, e.city].filter(Boolean).join(' · '), date: [e.startDate, e.endDate].filter(Boolean).join(' – '), text: plainText(e.description), bullets: e.bullets.map(b => plainText(b.text)).filter(Boolean) })) });
  const education = p.education.data.filter(e => e.degree.trim() || e.institution.trim() || e.description?.trim());
  if (education.length) blocks.push({ id: 'education', title: 'Education', items: education.map(e => ({ entryId: e.id, title: e.degree, subtitle: [e.institution, e.city].filter(Boolean).join(' · '), date: [e.startDate, e.endDate].filter(Boolean).join(' – ') || e.graduationDate, text: [plainText(e.description), e.gpa ? `GPA: ${e.gpa}` : '', e.honors?.join(' · ')].filter(Boolean).join('\n') })) });
  const skills = ['Technical', 'Tools', 'Soft', 'Languages'].map(category => ({ title: category === 'Soft' ? 'Interpersonal' : category, text: p.skills.data.filter(s => s.category === category).map(s => s.name.trim()).filter(Boolean).join(' · ') })).filter(s => s.text);
  if (skills.length) blocks.push({ id: 'skills', title: 'Skills', items: skills });
  const projects = p.projects.data.filter(e => e.name.trim() || e.bullets.some(b => b.text.trim()));
  if (projects.length) blocks.push({ id: 'projects', title: 'Projects', items: projects.map(e => ({ entryId: e.id, title: e.name, subtitle: [e.role, e.url].filter(Boolean).join(' · '), bullets: e.bullets.map(b => plainText(b.text)).filter(Boolean) })) });
  const certs = p.certifications.data.filter(e => e.name.trim());
  if (certs.length) blocks.push({ id: 'certifications', title: 'Certifications', items: certs.map(e => ({ entryId: e.id, title: e.name, subtitle: e.issuer, date: e.date })) });
  for (const custom of p.customSections || []) {
    const paragraphs = custom.paragraphs.map(x => plainText(x)).filter(Boolean);
    const items: ResumeBlock['items'] = custom.kind === 'experience'
      ? (custom.entries || []).filter(e => e.title.trim() || e.organization.trim() || e.description.trim()).map(e => ({ entryId: e.id, title: plainText(e.title), subtitle: [plainText(e.organization), plainText(e.location)].filter(Boolean).join(' · '), date: [e.startDate, e.endDate].filter(Boolean).join(' – '), text: plainText(e.description) }))
      : custom.kind === 'list' ? (paragraphs.length ? [{ bullets: paragraphs }] : [])
      : custom.kind === 'skills' ? (paragraphs.length ? [{ text: paragraphs.join(' · ') }] : [])
      : paragraphs.map(text => ({ text }));
    if (items.length) blocks.push({ id: `custom:${custom.id}`, title: custom.title.trim() || 'Additional information', items });
  }
  const order = orderedSections(p).map(s => s.id);
  return blocks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}
export function themeMetrics(theme: DocumentTheme) {
  const size = { small: 10, medium: 11, large: 12 }[theme.fontSize];
  const leading = { compact: 1.35, normal: 1.5, relaxed: 1.65 }[theme.lineSpacing];
  const font = theme.fontFamily === 'serif' ? 'Times-Roman' : theme.fontFamily === 'mono' ? 'Courier' : 'Helvetica';
  const bold = font === 'Times-Roman' ? 'Times-Bold' : font === 'Courier' ? 'Courier-Bold' : 'Helvetica-Bold';
  const gap = theme.layoutStyle === 'minimal' ? 12 : 18;
  return { size, leading, font, bold, gap, margin: theme.layoutStyle === 'minimal' ? 36 : 42 };
}

export function hasUnsupportedPDFText(profile: CVProfile): boolean {
  const visible = JSON.stringify([fullName(profile), contacts(profile), headline(profile), resumeBlocks(profile)]);
  const extraGlyphs = new Set([..."ŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™"]);
  return [...visible].some(char => char.codePointAt(0)! > 255 && !extraGlyphs.has(char));
}

export function orderedSections(profile: CVProfile) {
  const all: { id: SectionId; title: string; description: string; hint: string }[] = [...sections, ...(profile.customSections || []).map(s => ({ id: `custom:${s.id}` as SectionId, title: s.title.trim() || 'Custom section', description: 'An extra space for your experience, interests, or achievements.', hint: 'Add only information you want to share. Empty paragraphs are not exported.' }))];
  const order = [...new Set(profile.sectionOrder || all.map(s => s.id))];
  return [all[0], ...all.slice(1).sort((a,b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  })];
}
