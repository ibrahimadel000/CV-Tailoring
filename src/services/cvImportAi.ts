declare const __TAILOR_API_URL__: string | undefined;

import { v4 as uuid } from 'uuid';
import { cvProfileSchema, type CVProfile, type CustomResumeSection, type DocumentTheme, type SkillTag } from '@/types/schema';
import type { ExtractedCV, ImportFormat } from './cvImportModel';

interface AiImportPayload {
  name?: string;
  headline?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  otherUrl?: string;
  summary?: string;
  experience?: {
    roleTitle?: string;
    companyName?: string;
    city?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
    bullets?: string[];
  }[];
  education?: {
    degree?: string;
    institution?: string;
    city?: string;
    startDate?: string;
    endDate?: string;
    graduationDate?: string;
    gpa?: string;
    honors?: string[];
    description?: string;
  }[];
  skills?: { name?: string; category?: string }[];
  projects?: { name?: string; role?: string; url?: string; bullets?: string[] }[];
  certifications?: { name?: string; issuer?: string; date?: string }[];
  customSections?: { title?: string; kind?: string; paragraphs?: string[] }[];
}

const VALID_SKILL_CATS = new Set<SkillTag['category']>(['Technical', 'Tools', 'Soft', 'Languages']);

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
}

function splitName(full: string): { firstName?: string; lastName?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return {};
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function mapAiImportToProfile(
  raw: AiImportPayload,
  extracted: ExtractedCV,
  fileName: string,
  format: ImportFormat,
  theme: DocumentTheme,
): CVProfile {
  const wrap = <T,>(title: string, data: T) => ({ id: uuid(), title, data, isLocked: false });
  const name = str(raw.name);
  const { firstName, lastName } = splitName(name);
  const hl = str(raw.headline);

  const experience = (Array.isArray(raw.experience) ? raw.experience : [])
    .map(e => ({
      id: uuid(),
      roleTitle: str(e?.roleTitle),
      companyName: str(e?.companyName),
      city: str(e?.city),
      startDate: str(e?.startDate),
      endDate: str(e?.endDate),
      description: str(e?.description),
      bullets: strArr(e?.bullets).map(text => ({ id: uuid(), text, isVerified: false })),
    }))
    .filter(e => e.roleTitle || e.companyName || e.description || e.bullets.length > 0);

  const education = (Array.isArray(raw.education) ? raw.education : [])
    .map(e => ({
      id: uuid(),
      degree: str(e?.degree),
      institution: str(e?.institution),
      city: str(e?.city),
      startDate: str(e?.startDate),
      endDate: str(e?.endDate),
      graduationDate: str(e?.graduationDate) || str(e?.endDate),
      gpa: str(e?.gpa),
      honors: strArr(e?.honors),
      description: str(e?.description),
    }))
    .filter(e => e.degree || e.institution);

  const skills: SkillTag[] = [];
  const seenSkills = new Set<string>();
  for (const s of Array.isArray(raw.skills) ? raw.skills : []) {
    const skillName = str(s?.name);
    if (!skillName) continue;
    const rawCat = str(s?.category) as SkillTag['category'];
    const category: SkillTag['category'] = VALID_SKILL_CATS.has(rawCat) ? rawCat : 'Technical';
    const key = `${category}:${skillName.toLowerCase()}`;
    if (seenSkills.has(key)) continue;
    seenSkills.add(key);
    skills.push({ id: uuid(), name: skillName, category });
  }

  const projects = (Array.isArray(raw.projects) ? raw.projects : [])
    .map(pr => ({
      id: uuid(),
      name: str(pr?.name),
      role: str(pr?.role),
      url: str(pr?.url),
      bullets: strArr(pr?.bullets).map(text => ({ id: uuid(), text, isVerified: false })),
    }))
    .filter(pr => pr.name || pr.role || pr.bullets.length > 0);

  const certifications = (Array.isArray(raw.certifications) ? raw.certifications : [])
    .map(c => ({
      id: uuid(),
      name: str(c?.name),
      issuer: str(c?.issuer),
      date: str(c?.date),
    }))
    .filter(c => c.name);

  const customSections: CustomResumeSection[] = [];
  const sectionOrder: string[] = ['personal'];
  const summaryText = str(raw.summary);
  if (summaryText) sectionOrder.push('summary');
  if (experience.length) sectionOrder.push('experience');
  if (education.length) sectionOrder.push('education');
  if (skills.length) sectionOrder.push('skills');
  if (projects.length) sectionOrder.push('projects');
  if (certifications.length) sectionOrder.push('certifications');

  for (const cs of Array.isArray(raw.customSections) ? raw.customSections : []) {
    const title = str(cs?.title).slice(0, 80);
    const paragraphs = strArr(cs?.paragraphs);
    if (!title || !paragraphs.length) continue;
    const kind: CustomResumeSection['kind'] =
      cs?.kind === 'list' || cs?.kind === 'skills' || cs?.kind === 'text' ? cs.kind : 'text';
    const id = uuid();
    customSections.push({ id, title, kind, paragraphs });
    sectionOrder.push(`custom:${id}`);
  }

  const warnings = [
    ...extracted.warnings,
    extracted.needsAiVision
      ? 'Extracted using AI vision for scanned/image content. Review dates, spelling, and links against your original.'
      : 'Enhanced with AI structure parsing to handle a complex layout or language. Review all sections against your original.',
  ];

  const profile: CVProfile = {
    profileId: uuid(),
    profileName: fileName.replace(/\.(pdf|docx|txt|md|png|jpe?g|webp)$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 100) || 'Imported resume',
    version: 0,
    lastConfirmed: '',
    documentTheme: { ...theme, ...(extracted.pageSize ? { pageSize: extracted.pageSize } : {}) },
    resumeHeader: wrap('Resume Header', {
      name,
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(hl ? { desiredJobPosition: hl, useAsHeadline: true } : {}),
      email: str(raw.email),
      phone: str(raw.phone),
      location: str(raw.location),
      linkedin: str(raw.linkedin),
      github: str(raw.github),
      portfolio: str(raw.portfolio),
      otherUrl: str(raw.otherUrl),
      showLocation: true,
      showPhone: true,
      showLinkedin: true,
      showGithub: true,
      showPortfolio: true,
      showOtherUrl: true,
    }),
    headline: wrap('Headline', hl),
    summary: wrap('Professional Summary', summaryText),
    experience: wrap('Work Experience', experience),
    education: wrap('Education', education),
    skills: wrap('Skills', skills),
    projects: wrap('Projects', projects),
    certifications: wrap('Certifications', certifications),
    customSections,
    sectionOrder,
    importedFrom: {
      fileName: fileName.slice(0, 240),
      format,
      method: 'ai',
      importedAt: new Date().toISOString(),
      sourceText: extracted.text.slice(0, 100000),
      warnings,
      ...(extracted.pages ? { pages: extracted.pages } : {}),
    },
  };

  return cvProfileSchema.parse(profile);
}

export async function requestAiImport(
  extracted: ExtractedCV,
  signal: AbortSignal,
): Promise<AiImportPayload | null> {
  const baseUrl = typeof __TAILOR_API_URL__ === 'string' && __TAILOR_API_URL__
    ? __TAILOR_API_URL__.replace(/\/api\/tailor\/?$/, '')
    : '';
  const endpoint = `${baseUrl}/api/import-cv`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: extracted.text,
      images: extracted.images ?? [],
    }),
    signal,
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.parsed || typeof data.parsed !== 'object' || Array.isArray(data.parsed)) return null;
  return data.parsed as AiImportPayload;
}

export function hasSubstantiveAiContent(profile: CVProfile): boolean {
  const h = profile.resumeHeader.data;
  const sectionItems =
    profile.experience.data.length +
    profile.education.data.length +
    profile.skills.data.length +
    profile.projects.data.length +
    profile.certifications.data.length +
    (profile.customSections ?? []).length;
  return sectionItems > 0 || Boolean(h.name.trim() && (h.email.trim() || profile.summary.data.trim()));
}
