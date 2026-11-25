import { v4 as uuidv4 } from 'uuid';
import { cvProfileSchema, type CVProfile } from '@/types/schema';

export const BACKUP_FORMAT = 'folio-backup-v1' as const;

export interface WorkspaceBackupFile {
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  profiles: CVProfile[];
}

export interface ParsedBackupResult {
  profiles: CVProfile[];
  skippedCount: number;
}

export function serializeBackupJson(profiles: CVProfile[]): string {
  const payload: WorkspaceBackupFile = {
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    profiles,
  };
  return JSON.stringify(payload, null, 2);
}

export function buildBackupBlob(profiles: CVProfile[]): Blob {
  return new Blob([serializeBackupJson(profiles)], { type: 'application/json;charset=utf-8' });
}

export function parseBackupJson(rawText: string, existingProfileIds: Iterable<string> = []): ParsedBackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('This file is not valid JSON.');
  }

  let candidates: unknown[];
  if (Array.isArray(parsed)) {
    candidates = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { profiles?: unknown }).profiles)) {
    candidates = (parsed as { profiles: unknown[] }).profiles;
  } else if (parsed && typeof parsed === 'object' && 'profileId' in parsed && 'resumeHeader' in parsed) {
    candidates = [parsed];
  } else {
    throw new Error('This JSON file does not contain Folio resume backup data.');
  }

  const takenIds = new Set<string>(existingProfileIds);
  const valid: CVProfile[] = [];
  let skippedCount = 0;

  for (const item of candidates) {
    const res = cvProfileSchema.safeParse(item);
    if (!res.success) {
      skippedCount++;
      continue;
    }
    const copy: CVProfile = JSON.parse(JSON.stringify(res.data));
    if (takenIds.has(copy.profileId)) {
      copy.profileId = uuidv4();
    }
    takenIds.add(copy.profileId);
    valid.push(copy);
  }

  if (!valid.length) {
    throw new Error('No valid resumes were found in this backup file.');
  }

  return { profiles: valid, skippedCount };
}
