import { useAppStore } from '@/store/useAppStore';
import { createCompositionRunner, type ComposeProvider, type Repository } from './workflow';
export const composerRepository: Repository = {
  readActive() { const s = useAppStore.getState(); return s.profiles.find(p => p.profileId === s.activeProfileId); },
  appendIfCurrent(snapshot, copy) {
    let committed = false;
    useAppStore.setState(state => {
      const active = state.profiles.find(p => p.profileId === state.activeProfileId);
      if (JSON.stringify(active) !== snapshot || state.profiles.some(p => p.profileId === copy.profileId)) return state;
      committed = true;
      return { profiles: [...state.profiles, copy], activeProfileId: copy.profileId, documentTheme: { ...(copy.documentTheme ?? state.documentTheme) } };
    });
    return committed;
  },
};
export const createStoreComposer = (provider: ComposeProvider) => createCompositionRunner(composerRepository, provider);
