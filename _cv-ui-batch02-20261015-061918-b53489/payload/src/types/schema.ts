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
  city?: string;
  startDate: string;
  endDate: string;
  description?: string;
  bullets: BulletPoint[];
}

export const experienceEntrySchema = z.object({
  id: z.string().uuid(),
  roleTitle: z.string(),
  companyName: z.string(),
  city: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  description: z.string().optional(),
  bullets: z.array(bulletPointSchema),
});

export interface EducationEntry {
  id: string;
  degree: string;
  institution: string;
  city?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  graduationDate?: string;
  gpa?: string;
  honors?: string[];
}

export const educationEntrySchema = z.object({
  id: z.string().uuid(),
  degree: z.string(),
  institution: z.string(),
  city: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
  graduationDate: z.string().optional(),
  gpa: z.string().optional(),
  honors: z.array(z.string()).optional(),
});

export interface ResumeHeader {
  name: string;
  firstName?: string;
  lastName?: string;
  desiredJobPosition?: string;
  useAsHeadline?: boolean;
  photoUrl?: string;
  email: string;
  phone: string;
  linkedin: string;
  location?: string;
  suffixName?: string;
  github?: string;
  portfolio?: string;
  otherUrl?: string;
  showLocation?: boolean;
  showSuffixName?: boolean;
  showPhone?: boolean;
  showLinkedin?: boolean;
  showGithub?: boolean;
  showPortfolio?: boolean;
  showOtherUrl?: boolean;
}

export const resumeHeaderDataSchema = z.object({
  name: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  desiredJobPosition: z.string().optional(),
  useAsHeadline: z.boolean().optional(),
  photoUrl: z.string().optional(),
  email: z.string(),
  phone: z.string(),
  linkedin: z.string(),
  location: z.string().optional(),
  suffixName: z.string().optional(),
  github: z.string().optional(),
  portfolio: z.string().optional(),
  otherUrl: z.string().optional(),
  showLocation: z.boolean().optional(),
  showSuffixName: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  showLinkedin: z.boolean().optional(),
  showGithub: z.boolean().optional(),
  showPortfolio: z.boolean().optional(),
  showOtherUrl: z.boolean().optional(),
});

export interface CertificationEntry {
  id: string;
  name: string;
  issuer: string;
  date: string;
}

export const certificationEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  issuer: z.string(),
  date: z.string(),
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
  level?: string;
  category: 'Technical' | 'Soft' | 'Tools' | 'Languages';
}

export const skillTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  level: z.string().optional(),
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

export const resumeHeaderSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  isLocked: z.boolean(),
  data: resumeHeaderDataSchema,
});

export const headlineSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  isLocked: z.boolean(),
  data: z.string(),
});

export const certificationsSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  isLocked: z.boolean(),
  data: z.array(certificationEntrySchema),
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

export interface CustomResumeSection {
  id: string;
  title: string;
  paragraphs: string[];
}
export const customResumeSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  paragraphs: z.array(z.string()),
});

// ── CV Profile (A Single Document Version) ──

export interface CVProfile {
  profileId: string;
  customSections?: CustomResumeSection[];
  sectionOrder?: string[];
  profileName: string; // e.g., "My Main CV" or "Tailored for Google"
  baseProfileId?: string; // If this was cloned from another CV
  targetJob?: string; // Job description if tailored
  matchScore?: number; // AI score if tailored
  version: number;
  lastConfirmed: string;
  resumeHeader: SectionBlock<ResumeHeader>;
  headline: SectionBlock<string>;
  summary: SectionBlock<string>;
  education: SectionBlock<EducationEntry[]>;
  certifications: SectionBlock<CertificationEntry[]>;
  experience: SectionBlock<ExperienceEntry[]>;
  projects: SectionBlock<ProjectEntry[]>;
  skills: SectionBlock<SkillTag[]>;
}

export const cvProfileSchema = z.object({
  customSections: z.array(customResumeSectionSchema).optional(),
  sectionOrder: z.array(z.string()).optional(),
  profileId: z.string().uuid(),
  profileName: z.string(),
  baseProfileId: z.string().uuid().optional(),
  targetJob: z.string().optional(),
  matchScore: z.number().optional(),
  version: z.number().int().min(0),
  lastConfirmed: z.string(),
  resumeHeader: resumeHeaderSectionSchema,
  headline: headlineSectionSchema,
  summary: summarySectionSchema,
  education: educationSectionSchema,
  certifications: certificationsSectionSchema,
  experience: experienceSectionSchema,
  projects: projectsSectionSchema,
  skills: skillsSectionSchema,
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

// ── Backwards Compatibility Types ──
export type MasterProfile = CVProfile;

export interface DiffToken {
  type: 'unchanged' | 'added' | 'removed';
  text?: string;
  value?: string;
}

export interface ValidationFlag {
  type: 'fabricated_metric' | 'unknown_proper_noun' | 'unknown_technology' | 'substantially_altered' | string;
  value?: string;
  severity?: 'critical' | 'warning' | 'info';
  dismissed?: boolean;
  message?: string;
}

export interface ReviewBulletState {
  id: string;
  sourceBulletId?: string;
  original: string;
  suggested?: string;
  aiTailored?: string;
  userEdited: string;
  status: 'pending' | 'accepted' | 'rejected';
  flags?: ValidationFlag[];
  validationFlags?: ValidationFlag[];
  diffTokens: DiffToken[];
}

export interface TailoredProfile {
  id?: string;
  profileId: string;
  jobTitle: string;
  matchScore: number;
  bullets: any;
}
