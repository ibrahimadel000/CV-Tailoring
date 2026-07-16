import { z } from 'zod';

// ── Atomic Units ──

export interface BulletPoint {
  id: string;
  text: string;
  isVerified: boolean;
}

export const bulletPointSchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
  isVerified: z.boolean(),
});

export interface ExperienceEntry {
  id: string;
  roleTitle: string;
  companyName: string;
  startDate: string;
  endDate: string;
  bullets: BulletPoint[];
}

export const experienceEntrySchema = z.object({
  id: z.string().uuid(),
  roleTitle: z.string(),
  companyName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  bullets: z.array(bulletPointSchema),
});

export interface EducationEntry {
  id: string;
  degree: string;
  institution: string;
  graduationDate: string;
  gpa?: string;
  honors?: string[];
}

export const educationEntrySchema = z.object({
  id: z.string().uuid(),
  degree: z.string(),
  institution: z.string(),
  graduationDate: z.string(),
  gpa: z.string().optional(),
  honors: z.array(z.string()).optional(),
});

export interface ProjectEntry {
  id: string;
  name: string;
  role?: string;
  url?: string;
  bullets: BulletPoint[];
}

export const projectEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.string().optional(),
  url: z.string().optional(),
  bullets: z.array(bulletPointSchema),
});

export interface SkillTag {
  id: string;
  name: string;
  category: 'Technical' | 'Soft' | 'Tools' | 'Languages';
}

export const skillTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.enum(['Technical', 'Soft', 'Tools', 'Languages']),
});

// ── Section Wrapper ──

export interface SectionBlock<T> {
  id: string;
  title: string;
  isLocked: boolean;
  data: T;
}

// Zod schemas for specific section blocks
export const summarySectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  isLocked: z.boolean(),
  data: z.string(),
});

export const experienceSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  isLocked: z.boolean(),
  data: z.array(experienceEntrySchema),
});

export const skillsSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  isLocked: z.boolean(),
  data: z.array(skillTagSchema),
});

export const educationSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  isLocked: z.boolean(),
  data: z.array(educationEntrySchema),
});

export const projectsSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  isLocked: z.boolean(),
  data: z.array(projectEntrySchema),
});

// ── CV Profile (A Single Document Version) ──

export interface CVProfile {
  profileId: string;
  profileName: string; // e.g., "My Main CV" or "Tailored for Google"
  baseProfileId?: string; // If this was cloned from another CV
  targetJob?: string; // Job description if tailored
  matchScore?: number; // AI score if tailored
  version: number;
  lastConfirmed: string;
  summary: SectionBlock<string>;
  experience: SectionBlock<ExperienceEntry[]>;
  skills: SectionBlock<SkillTag[]>;
  education: SectionBlock<EducationEntry[]>;
  projects: SectionBlock<ProjectEntry[]>;
}

export const cvProfileSchema = z.object({
  profileId: z.string().uuid(),
  profileName: z.string(),
  baseProfileId: z.string().uuid().optional(),
  targetJob: z.string().optional(),
  matchScore: z.number().optional(),
  version: z.number().int().min(0),
  lastConfirmed: z.string(),
  summary: summarySectionSchema,
  experience: experienceSectionSchema,
  skills: skillsSectionSchema,
  education: educationSectionSchema,
  projects: projectsSectionSchema,
});

// ── Entity Whitelist (Extracted from locked MasterProfile) ──

export interface MasterProfileEntities {
  companyNames: Set<string>;
  jobTitles: Set<string>;
  technologies: Set<string>;
  metrics: Set<string>;
  properNouns: Set<string>;
  allText: string;
}

// Removed ReviewBulletState and TailoredProfile schemas as they are replaced by unified CVProfile versioning

// ── AI Response Schema (what we ask Gemini to return) ──

export interface AITailoredBullet {
  sourceBulletId: string;
  originalText: string;
  tailoredText: string;
}

export const aiTailoredBulletSchema = z.object({
  sourceBulletId: z.string(),
  originalText: z.string(),
  tailoredText: z.string(),
});

export interface AITailoredExperience {
  experienceId: string;
  bullets: AITailoredBullet[];
}

export const aiTailoredExperienceSchema = z.object({
  experienceId: z.string(),
  bullets: z.array(aiTailoredBulletSchema),
});

export interface AITailoredResponse {
  jobTitle: string;
  company: string;
  matchScore: number;
  missingSkills: string[];
  tailoredSummary: string;
  selectedExperienceIds: string[];
  selectedProjectIds: string[];
  experiences: AITailoredExperience[];
}

export const aiTailoredResponseSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
  matchScore: z.number().min(0).max(100),
  missingSkills: z.array(z.string()),
  tailoredSummary: z.string(),
  selectedExperienceIds: z.array(z.string()),
  selectedProjectIds: z.array(z.string()),
  experiences: z.array(aiTailoredExperienceSchema),
});

// ── App State (Zustand Store Shape) ──

export type AppStep = 'edit' | 'confirm' | 'tailor' | 'review' | 'export';

export interface AppState {
  profiles: CVProfile[];
  activeProfileId: string | null;
  extensionConnected: boolean;
  extensionToken: string | null;
}
