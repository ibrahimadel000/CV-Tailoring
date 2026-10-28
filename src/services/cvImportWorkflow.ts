import { useAppStore, DEFAULT_DOCUMENT_THEME } from '@/store/useAppStore';
import { buildImportedProfile, CVImportError, importFormat } from './cvImportModel';
import { readCVFile } from './cvImportFiles';

// Extraction is local. No existing profile is mutated, even on cancellation or error.
export async function importCVFile(file: File, signal: AbortSignal) {
  const format = importFormat(file.name, file.size);
  const extracted = await readCVFile(file, signal);
  if (signal.aborted) throw new CVImportError('cancelled', 'Import cancelled. No resume was created.');
  const state = useAppStore.getState();
  const profile = buildImportedProfile(extracted, file.name, format, state.documentTheme ?? DEFAULT_DOCUMENT_THEME);
  if (signal.aborted) throw new CVImportError('cancelled', 'Import cancelled. No resume was created.');
  useAppStore.setState(current => ({ profiles: [...current.profiles, profile], activeProfileId: profile.profileId, documentTheme: { ...profile.documentTheme! } }));
  return profile;
}
