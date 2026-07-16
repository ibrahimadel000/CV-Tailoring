import { create } from 'zustand';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';
import type {
  CVProfile,
  ExperienceEntry,
  EducationEntry,
  ProjectEntry,
  SkillTag,
  BulletPoint,
  AITailoredResponse,
} from '@/types/schema';

// ── Store Interface ──

interface AppStore {
  // State
  profiles: CVProfile[];
  activeProfileId: string | null;
  extensionConnected: boolean;
  extensionToken: string | null;
  isLoading: boolean;
  error: string | null;

  // Profile Management
  createProfile: (name?: string) => string;
  cloneProfile: (sourceId: string, newName?: string, isTailored?: boolean, targetJob?: string, matchScore?: number) => string;
  setActiveProfile: (id: string) => void;
  deleteProfile: (id: string) => void;
  applyTailoredResponse: (response: AITailoredResponse) => void;

  // Active Profile Editors
  updateSummary: (text: string) => void;
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

  addSkill: (name: string, category: SkillTag['category']) => void;
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
    profileId: uuidv4(),
    profileName: name,
    version: 0,
    lastConfirmed: '',
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
    extensionConnected: false,
    extensionToken: null,
    isLoading: false,
    error: null,

    // Profile Management
    createProfile: (name = 'My Main CV') => {
      const newProfile = createEmptyProfile(name);
      set((state) => ({
        profiles: [...state.profiles, newProfile],
        activeProfileId: newProfile.profileId
      }));
      return newProfile.profileId;
    },

    cloneProfile: (sourceId, newName, isTailored, targetJob, matchScore) => {
      const { profiles } = get();
      const source = profiles.find(p => p.profileId === sourceId);
      if (!source) throw new Error('Source profile not found');

      // Deep clone using JSON stringify to completely detach references
      const clonedProfile: CVProfile = JSON.parse(JSON.stringify(source));
      
      clonedProfile.profileId = uuidv4(); // Issue new ID
      clonedProfile.profileName = newName || `${source.profileName} (Copy)`;
      clonedProfile.baseProfileId = sourceId;
      
      if (isTailored) {
        clonedProfile.targetJob = targetJob;
        clonedProfile.matchScore = matchScore;
      }

      set((state) => ({
        profiles: [...state.profiles, clonedProfile],
        activeProfileId: clonedProfile.profileId
      }));

      return clonedProfile.profileId;
    },

    setActiveProfile: (id) => set({ activeProfileId: id }),

    deleteProfile: (id) => {
      set((state) => {
        const remaining = state.profiles.filter(p => p.profileId !== id);
        let activeId = state.activeProfileId;
        if (activeId === id) {
          activeId = remaining.length > 0 ? remaining[remaining.length - 1].profileId : null;
        }
        return { profiles: remaining, activeProfileId: activeId };
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
    updateSummary: (text) => {
      updateActiveProfileData(p => ({
        summary: { ...p.summary, data: text }
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

    addSkill: (name, category) => {
      updateActiveProfileData(p => ({
        skills: {
          ...p.skills,
          data: [...p.skills.data, { id: uuidv4(), name, category }]
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
      try {
        const storedProfiles = await idbGet(STORAGE_KEY_PROFILES);
        const storedActiveId = await idbGet(STORAGE_KEY_ACTIVE_ID);
        
        if (storedProfiles && Array.isArray(storedProfiles) && storedProfiles.length > 0) {
          set({
            profiles: storedProfiles,
            activeProfileId: storedActiveId || storedProfiles[0].profileId,
          });
        } else {
          get().createProfile();
        }
      } catch (err) {
        console.error('Failed to load from storage:', err);
        get().createProfile();
      }
    },

    saveToStorage: async () => {
      try {
        const { profiles, activeProfileId } = get();
        await idbSet(STORAGE_KEY_PROFILES, profiles);
        await idbSet(STORAGE_KEY_ACTIVE_ID, activeProfileId);
      } catch (err) {
        console.error('Failed to save to storage:', err);
      }
    },
  };
});
