import { create } from 'zustand';
import { get as idbGet, setMany as idbSetMany } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';
import { createSampleProfile } from '@/mock/profile';
import { cvProfileSchema, documentThemeSchema } from '@/types/schema';
import type { DocumentTheme } from '@/types/schema';
export type { DocumentTheme } from '@/types/schema';
import type {
  CVProfile,
  ExperienceEntry,
  EducationEntry,
  ProjectEntry,
  SkillTag,
  BulletPoint,
  AITailoredResponse,
  ResumeHeader,
  CertificationEntry,
} from '@/types/schema';

export const DEFAULT_DOCUMENT_THEME: DocumentTheme = {
  accentColor: '#2557a7', fontFamily: 'sans', fontSize: 'medium',
  lineSpacing: 'normal', layoutStyle: 'modern',
};

// Older releases stored one shared theme. Migrate that appearance once into
// each existing resume, never silently replace content or an invalid document.
function legacyTheme(value: unknown): DocumentTheme {
  const theme = { ...DEFAULT_DOCUMENT_THEME };
  if (!value || typeof value !== 'object') return theme;
  for (const key of Object.keys(documentThemeSchema.shape) as (keyof DocumentTheme)[]) {
    const parsed = documentThemeSchema.shape[key].safeParse((value as Record<string, unknown>)[key]);
    if (parsed.success) Object.assign(theme, { [key]: parsed.data });
  }
  return theme;
}

interface AppStore {
  // State
  profiles: CVProfile[];
  activeProfileId: string | null;
  documentTheme: DocumentTheme;
  jobDescription: string;
  extensionConnected: boolean;
  extensionToken: string | null;
  isLoading: boolean;
  error: string | null;

  setJobDescription: (jd: string) => void;

  // Profile Management
  createProfile: (name?: string) => string;
  loadSampleProfile: () => string;
  cloneProfile: (sourceId: string, newName?: string, isTailored?: boolean, targetJob?: string, matchScore?: number) => string;
  setActiveProfile: (id: string) => void;
  updateProfileName: (id: string, name: string) => void;
  setDocumentTheme: (theme: Partial<DocumentTheme>) => void;
  deleteProfile: (id: string) => void;
  applyTailoredResponse: (response: AITailoredResponse) => void;

  // Active Profile Editors
  updateResumeHeader: (updates: Partial<ResumeHeader>) => void;
  updateHeadline: (text: string) => void;
  updateSummary: (text: string) => void;
  
  addCertification: () => void;
  updateCertification: (id: string, updates: Partial<CertificationEntry>) => void;
  removeCertification: (id: string) => void;

  addExperience: () => void;
  updateExperience: (id: string, updates: Partial<ExperienceEntry>) => void;
  removeExperience: (id: string) => void;
  addBulletToExperience: (experienceId: string) => void;
  updateBullet: (experienceId: string, bulletId: string, text: string) => void;
  removeBullet: (experienceId: string, bulletId: string) => void;
  
  addEducation: () => void;
  updateEducation: (id: string, updates: Partial<EducationEntry>) => void;
  removeEducation: (id: string) => void;

  addProject: () => void;
  updateProject: (id: string, updates: Partial<ProjectEntry>) => void;
  removeProject: (id: string) => void;
  addBulletToProject: (projectId: string) => void;
  updateProjectBullet: (projectId: string, bulletId: string, text: string) => void;
  removeProjectBullet: (projectId: string, bulletId: string) => void;

  addSkill: () => void;
  updateSkill: (id: string, updates: Partial<SkillTag>) => void;
  removeSkill: (id: string) => void;

  // UI State
  setExtensionConnected: (connected: boolean, token?: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Persistence
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

// ── Helper Functions ──

function createEmptyProfile(name: string = 'My Main CV'): CVProfile {
  return {
    documentTheme: { ...DEFAULT_DOCUMENT_THEME },
    profileId: uuidv4(),
    profileName: name,
    version: 0,
    lastConfirmed: '',
    resumeHeader: {
      id: uuidv4(),
      title: 'Resume Header',
      isLocked: false,
      data: { 
        name: '', email: '', phone: '', linkedin: '', location: '',
        suffixName: '', github: '', portfolio: '', otherUrl: '',
        showLocation: true, showSuffixName: true, showPhone: true,
        showLinkedin: true, showGithub: true, showPortfolio: true, showOtherUrl: true
      },
    },
    headline: {
      id: uuidv4(),
      title: 'Headline',
      isLocked: false,
      data: '',
    },
    summary: {
      id: uuidv4(),
      title: 'Professional Summary',
      isLocked: false,
      data: '',
    },
    experience: {
      id: uuidv4(),
      title: 'Work Experience',
      isLocked: false,
      data: [],
    },
    skills: {
      id: uuidv4(),
      title: 'Skills',
      isLocked: false,
      data: [],
    },
    education: {
      id: uuidv4(),
      title: 'Education',
      isLocked: false,
      data: [],
    },
    certifications: {
      id: uuidv4(),
      title: 'Certifications',
      isLocked: false,
      data: [],
    },
    projects: {
      id: uuidv4(),
      title: 'Projects',
      isLocked: false,
      data: [],
    },
  };
}

function createEmptyBullet(): BulletPoint {
  return { id: uuidv4(), text: '', isVerified: false };
}

// ── Persistence Keys ──
const STORAGE_KEY_PROFILES = 'cv-tailor-profiles-v2';
const STORAGE_KEY_ACTIVE_ID = 'cv-tailor-active-id-v2';

// ── Store ──

export const useAppStore = create<AppStore>((set, get) => {
  
  const updateActiveProfileData = (updater: (profile: CVProfile) => Partial<CVProfile>) => {
    const { profiles, activeProfileId } = get();
    if (!activeProfileId) return;

    const profileIndex = profiles.findIndex(p => p.profileId === activeProfileId);
    if (profileIndex === -1) return;

    const currentProfile = profiles[profileIndex];
    const updates = updater(currentProfile);
    
    const newProfiles = [...profiles];
    newProfiles[profileIndex] = { ...currentProfile, ...updates };

    set({ profiles: newProfiles });
  };

  return {
    // Initial State
    profiles: [],
    activeProfileId: null,
    documentTheme: { ...DEFAULT_DOCUMENT_THEME },
    jobDescription: '',
    setJobDescription: (jd: string) => set({ jobDescription: jd }),
    extensionConnected: false,
    extensionToken: null,
    isLoading: false,
    error: null,

    // Profile Management
    createProfile: (name = 'My Main CV') => {
      const newProfile = createEmptyProfile(name);
      set((state) => ({
        profiles: [...state.profiles, newProfile],
        activeProfileId: newProfile.profileId,
        documentTheme: { ...newProfile.documentTheme! },
      }));
      return newProfile.profileId;
    },

    loadSampleProfile: () => {
      const sample = { ...createSampleProfile('Alex Morgan (Sample CV)'), documentTheme: { ...DEFAULT_DOCUMENT_THEME } };
      set((state) => ({
        profiles: [...state.profiles, sample],
        activeProfileId: sample.profileId,
        documentTheme: { ...sample.documentTheme },
      }));
      return sample.profileId;
    },

    cloneProfile: (sourceId, newName, isTailored, targetJob, matchScore) => {
      const { profiles } = get();
      const source = profiles.find(p => p.profileId === sourceId);
      if (!source) throw new Error('Source profile not found');

      // Deep clone using JSON stringify to completely detach references
      const clonedProfile: CVProfile = JSON.parse(JSON.stringify(source));
      
      clonedProfile.documentTheme = { ...(source.documentTheme ?? get().documentTheme) };
      clonedProfile.profileId = uuidv4(); // Issue new ID
      clonedProfile.profileName = newName || `${source.profileName} (Copy)`;
      clonedProfile.baseProfileId = sourceId;
      
      if (isTailored) {
        clonedProfile.targetJob = targetJob;
        clonedProfile.matchScore = matchScore;
      }

      set((state) => ({
        profiles: [...state.profiles, clonedProfile],
        activeProfileId: clonedProfile.profileId,
        documentTheme: { ...clonedProfile.documentTheme! },
      }));

      return clonedProfile.profileId;
    },

    setActiveProfile: (id) => set(state => {
      if (!state.profiles.some(p => p.profileId === id)) return state;
      const profiles = state.profiles.map(p => p.documentTheme ? p : { ...p, documentTheme: { ...state.documentTheme } });
      return { profiles, activeProfileId: id, documentTheme: { ...profiles.find(p => p.profileId === id)!.documentTheme! } };
    }),

    updateProfileName: (id, name) => {
      set((state) => ({
        profiles: state.profiles.map(p => p.profileId === id ? { ...p, profileName: name } : p)
      }));
    },

    setDocumentTheme: (theme) => {
      set(state => {
        if (!state.profiles.some(p => p.profileId === state.activeProfileId)) return state;
        const parsed = documentThemeSchema.safeParse({ ...state.documentTheme, ...theme });
        if (!parsed.success) return state;
        return {
          documentTheme: parsed.data,
          profiles: state.profiles.map(p => ({ ...p, documentTheme: p.profileId === state.activeProfileId ? { ...parsed.data } : p.documentTheme ?? { ...state.documentTheme } })),
        };
      });
    },

    deleteProfile: (id) => {
      set((state) => {
        const remaining = state.profiles.filter(p => p.profileId !== id);
        let activeId = state.activeProfileId;
        if (activeId === id) {
          activeId = remaining.length > 0 ? remaining[remaining.length - 1].profileId : null;
        }
        return { profiles: remaining, activeProfileId: activeId,
          documentTheme: { ...(remaining.find(p => p.profileId === activeId)?.documentTheme ?? state.documentTheme) } };
      });
    },

    applyTailoredResponse: (response) => {
      updateActiveProfileData(p => {
        const newExperienceData = p.experience.data.map(exp => {
          if (!response.selectedExperienceIds.includes(exp.id)) return exp; // Or maybe filter them out?
          
          const tailoredExp = response.experiences.find(e => e.experienceId === exp.id);
          if (!tailoredExp) return exp;

          return {
            ...exp,
            bullets: exp.bullets.map(b => {
              const tailoredBullet = tailoredExp.bullets.find(tb => tb.sourceBulletId === b.id);
              if (!tailoredBullet) return b;
              return { ...b, text: tailoredBullet.tailoredText };
            })
          };
        }).filter(exp => response.selectedExperienceIds.includes(exp.id)); // Drop unselected experiences

        return {
          targetJob: response.jobTitle,
          matchScore: response.matchScore,
          summary: { ...p.summary, data: response.tailoredSummary },
          experience: { ...p.experience, data: newExperienceData },
          projects: { 
            ...p.projects, 
            data: p.projects.data.filter(proj => response.selectedProjectIds.includes(proj.id))
          }
        };
      });
    },

    // Active Profile Editors
    updateResumeHeader: (updates) => {
      updateActiveProfileData(p => ({
        resumeHeader: { ...p.resumeHeader, data: { ...p.resumeHeader.data, ...updates } }
      }));
    },

    updateHeadline: (text) => {
      updateActiveProfileData(p => ({
        headline: { ...p.headline, data: text }
      }));
    },

    updateSummary: (text) => {
      updateActiveProfileData(p => ({
        summary: { ...p.summary, data: text }
      }));
    },

    addCertification: () => {
      updateActiveProfileData(p => ({
        certifications: {
          ...p.certifications,
          data: [...p.certifications.data, { id: uuidv4(), name: '', issuer: '', date: '' }]
        }
      }));
    },

    updateCertification: (id, updates) => {
      updateActiveProfileData(p => ({
        certifications: {
          ...p.certifications,
          data: p.certifications.data.map(cert => cert.id === id ? { ...cert, ...updates } : cert)
        }
      }));
    },

    removeCertification: (id) => {
      updateActiveProfileData(p => ({
        certifications: {
          ...p.certifications,
          data: p.certifications.data.filter(cert => cert.id !== id)
        }
      }));
    },

    addExperience: () => {
      updateActiveProfileData(p => ({
        experience: {
          ...p.experience,
          data: [...p.experience.data, {
            id: uuidv4(),
            roleTitle: '',
            companyName: '',
            startDate: '',
            endDate: '',
            bullets: [createEmptyBullet()],
          }]
        }
      }));
    },

    updateExperience: (id, updates) => {
      updateActiveProfileData(p => ({
        experience: {
          ...p.experience,
          data: p.experience.data.map(exp => exp.id === id ? { ...exp, ...updates } : exp)
        }
      }));
    },

    removeExperience: (id) => {
      updateActiveProfileData(p => ({
        experience: {
          ...p.experience,
          data: p.experience.data.filter(exp => exp.id !== id)
        }
      }));
    },

    addBulletToExperience: (experienceId) => {
      updateActiveProfileData(p => ({
        experience: {
          ...p.experience,
          data: p.experience.data.map(exp => exp.id === experienceId
            ? { ...exp, bullets: [...exp.bullets, createEmptyBullet()] }
            : exp)
        }
      }));
    },

    updateBullet: (experienceId, bulletId, text) => {
      updateActiveProfileData(p => ({
        experience: {
          ...p.experience,
          data: p.experience.data.map(exp => exp.id === experienceId
            ? { ...exp, bullets: exp.bullets.map(b => b.id === bulletId ? { ...b, text } : b) }
            : exp)
        }
      }));
    },

    removeBullet: (experienceId, bulletId) => {
      updateActiveProfileData(p => ({
        experience: {
          ...p.experience,
          data: p.experience.data.map(exp => exp.id === experienceId
            ? { ...exp, bullets: exp.bullets.filter(b => b.id !== bulletId) }
            : exp)
        }
      }));
    },

    addEducation: () => {
      updateActiveProfileData(p => ({
        education: {
          ...p.education,
          data: [...p.education.data, {
            id: uuidv4(),
            degree: '',
            institution: '',
            graduationDate: '',
          }]
        }
      }));
    },

    updateEducation: (id, updates) => {
      updateActiveProfileData(p => ({
        education: {
          ...p.education,
          data: p.education.data.map(edu => edu.id === id ? { ...edu, ...updates } : edu)
        }
      }));
    },

    removeEducation: (id) => {
      updateActiveProfileData(p => ({
        education: {
          ...p.education,
          data: p.education.data.filter(edu => edu.id !== id)
        }
      }));
    },

    addProject: () => {
      updateActiveProfileData(p => ({
        projects: {
          ...p.projects,
          data: [...p.projects.data, {
            id: uuidv4(),
            name: '',
            bullets: [createEmptyBullet()],
          }]
        }
      }));
    },

    updateProject: (id, updates) => {
      updateActiveProfileData(p => ({
        projects: {
          ...p.projects,
          data: p.projects.data.map(proj => proj.id === id ? { ...proj, ...updates } : proj)
        }
      }));
    },

    removeProject: (id) => {
      updateActiveProfileData(p => ({
        projects: {
          ...p.projects,
          data: p.projects.data.filter(proj => proj.id !== id)
        }
      }));
    },

    addBulletToProject: (projectId) => {
      updateActiveProfileData(p => ({
        projects: {
          ...p.projects,
          data: p.projects.data.map(proj => proj.id === projectId
            ? { ...proj, bullets: [...proj.bullets, createEmptyBullet()] }
            : proj)
        }
      }));
    },

    updateProjectBullet: (projectId, bulletId, text) => {
      updateActiveProfileData(p => ({
        projects: {
          ...p.projects,
          data: p.projects.data.map(proj => proj.id === projectId
            ? { ...proj, bullets: proj.bullets.map(b => b.id === bulletId ? { ...b, text } : b) }
            : proj)
        }
      }));
    },

    removeProjectBullet: (projectId, bulletId) => {
      updateActiveProfileData(p => ({
        projects: {
          ...p.projects,
          data: p.projects.data.map(proj => proj.id === projectId
            ? { ...proj, bullets: proj.bullets.filter(b => b.id !== bulletId) }
            : proj)
        }
      }));
    },

    addSkill: () => {
      updateActiveProfileData(p => ({
        skills: {
          ...p.skills,
          data: [...p.skills.data, { id: uuidv4(), name: '', level: '', category: 'Technical' }]
        }
      }));
    },

    updateSkill: (id, updates) => {
      updateActiveProfileData(p => ({
        skills: {
          ...p.skills,
          data: p.skills.data.map(skill => skill.id === id ? { ...skill, ...updates } : skill)
        }
      }));
    },

    removeSkill: (id) => {
      updateActiveProfileData(p => ({
        skills: {
          ...p.skills,
          data: p.skills.data.filter(s => s.id !== id)
        }
      }));
    },

    // Extension & UI
    setExtensionConnected: (connected, token) =>
      set({ extensionConnected: connected, extensionToken: token ?? null }),

    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),

    // Persistence
    loadFromStorage: async () => {
      // Fail closed on storage errors: never overwrite data that failed to load.
      const storedProfiles = await idbGet(STORAGE_KEY_PROFILES);
      const storedActiveId = await idbGet(STORAGE_KEY_ACTIVE_ID);
      const storedTheme = await idbGet('cv-tailor-builder-theme-v1');
      if (storedProfiles !== undefined && !Array.isArray(storedProfiles)) {
        throw new Error('Saved resume data is not a valid list.');
      }
      const fallback = legacyTheme(storedTheme);
      if (Array.isArray(storedProfiles)) {
        if (!storedProfiles.every(p => cvProfileSchema.safeParse(p).success)) throw new Error('A saved resume could not be validated.');
        const profiles: CVProfile[] = storedProfiles.map(p => ({ ...p, documentTheme: { ...(p.documentTheme ?? fallback) } }));
        const activeProfileId = profiles.some(p => p.profileId === storedActiveId) ? storedActiveId : (profiles[0]?.profileId || null);
        set({ profiles, activeProfileId, documentTheme: { ...(profiles.find(p => p.profileId === activeProfileId)?.documentTheme ?? fallback) } });
      } else {
        get().createProfile('My first resume');
      }
    },

    saveToStorage: async () => {
      const { profiles, activeProfileId, documentTheme } = get();
      // A single IndexedDB transaction keeps resume, active ID, and design in sync.
      await idbSetMany([
        [STORAGE_KEY_PROFILES, profiles],
        [STORAGE_KEY_ACTIVE_ID, activeProfileId],
        ['cv-tailor-builder-theme-v1', documentTheme],
      ]);
    },
  };
});
