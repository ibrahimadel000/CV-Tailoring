/**
 * Bounded, coalesced per-profile undo/redo history engine.
 * Adapted from Reactive Resume's draft history design (MIT License).
 */
import type { CVProfile } from '@/types/schema';

export const MAX_HISTORY_ENTRIES = 200;
export const HISTORY_COALESCE_MS = 800;

export interface ProfileHistory {
  past: CVProfile[];
  future: CVProfile[];
  lastPushAt: number;
  lastCoalesceKey: string | null;
}

export type HistoryState = Record<string, ProfileHistory>;

export function createHistoryState(): HistoryState {
  return {};
}

function getBucket(history: HistoryState, profileId: string): ProfileHistory {
  return history[profileId] ?? { past: [], future: [], lastPushAt: 0, lastCoalesceKey: null };
}

/**
 * Infer a coarse field/section key so rapid typing in the same section coalesces into
 * one undo step, while structural changes (adding/deleting entries, bullets, skills, or
 * custom sections) return null so they always create their own undo checkpoint.
 */
export function inferCoalesceKey(prev: CVProfile, next: CVProfile): string | null {
  if (prev === next) return null;

  // Never coalesce structural additions or deletions
  if (
    prev.experience.data.length !== next.experience.data.length ||
    prev.education.data.length !== next.education.data.length ||
    prev.projects.data.length !== next.projects.data.length ||
    prev.skills.data.length !== next.skills.data.length ||
    prev.certifications.data.length !== next.certifications.data.length ||
    (prev.customSections?.length ?? 0) !== (next.customSections?.length ?? 0)
  ) {
    return null;
  }
  for (let i = 0; i < prev.experience.data.length; i++) {
    if (prev.experience.data[i].bullets.length !== next.experience.data[i].bullets.length) return null;
  }
  for (let i = 0; i < prev.projects.data.length; i++) {
    if (prev.projects.data[i].bullets.length !== next.projects.data[i].bullets.length) return null;
  }

  const changed: string[] = [];
  if (prev.profileName !== next.profileName) changed.push('profileName');
  if (prev.resumeHeader !== next.resumeHeader) changed.push('resumeHeader');
  if (prev.headline !== next.headline) changed.push('headline');
  if (prev.summary !== next.summary) changed.push('summary');
  if (prev.experience !== next.experience) changed.push('experience');
  if (prev.education !== next.education) changed.push('education');
  if (prev.projects !== next.projects) changed.push('projects');
  if (prev.skills !== next.skills) changed.push('skills');
  if (prev.certifications !== next.certifications) changed.push('certifications');
  if (prev.customSections !== next.customSections) changed.push('customSections');
  if (prev.documentTheme !== next.documentTheme) changed.push('documentTheme');
  if (prev.sectionOrder !== next.sectionOrder) return null; // section drag-reorder is discrete

  return changed.length === 1 ? changed[0] : null;
}

export function recordProfileEdit(
  history: HistoryState,
  prevProfile: CVProfile,
  nextProfile: CVProfile,
  options: { now?: number; coalesceKey?: string | null; maxEntries?: number; coalesceMs?: number } = {},
): HistoryState {
  if (prevProfile === nextProfile || prevProfile.profileId !== nextProfile.profileId) return history;
  const now = options.now ?? Date.now();
  const maxEntries = options.maxEntries ?? MAX_HISTORY_ENTRIES;
  const coalesceMs = options.coalesceMs ?? HISTORY_COALESCE_MS;
  const coalesceKey = options.coalesceKey !== undefined ? options.coalesceKey : inferCoalesceKey(prevProfile, nextProfile);

  const bucket = getBucket(history, prevProfile.profileId);
  const canCoalesce =
    bucket.past.length > 0 &&
    coalesceKey !== null &&
    bucket.lastCoalesceKey === coalesceKey &&
    now - bucket.lastPushAt <= coalesceMs;

  if (canCoalesce) {
    return {
      ...history,
      [prevProfile.profileId]: {
        past: bucket.past,
        future: [],
        lastPushAt: now,
        lastCoalesceKey: coalesceKey,
      },
    };
  }

  const nextPast =
    bucket.past.length >= maxEntries
      ? [...bucket.past.slice(bucket.past.length - maxEntries + 1), prevProfile]
      : [...bucket.past, prevProfile];

  return {
    ...history,
    [prevProfile.profileId]: {
      past: nextPast,
      future: [],
      lastPushAt: now,
      lastCoalesceKey: coalesceKey,
    },
  };
}

export function undoProfileEdit(
  history: HistoryState,
  currentProfile: CVProfile,
): { history: HistoryState; restored: CVProfile | null } {
  const bucket = getBucket(history, currentProfile.profileId);
  if (!bucket.past.length) return { history, restored: null };
  const restored = bucket.past[bucket.past.length - 1];
  const nextPast = bucket.past.slice(0, -1);
  const nextFuture = [currentProfile, ...bucket.future].slice(0, MAX_HISTORY_ENTRIES);
  return {
    history: {
      ...history,
      [currentProfile.profileId]: {
        past: nextPast,
        future: nextFuture,
        lastPushAt: 0,
        lastCoalesceKey: null,
      },
    },
    restored,
  };
}

export function redoProfileEdit(
  history: HistoryState,
  currentProfile: CVProfile,
): { history: HistoryState; restored: CVProfile | null } {
  const bucket = getBucket(history, currentProfile.profileId);
  if (!bucket.future.length) return { history, restored: null };
  const restored = bucket.future[0];
  const nextFuture = bucket.future.slice(1);
  const nextPast = [...bucket.past, currentProfile].slice(-MAX_HISTORY_ENTRIES);
  return {
    history: {
      ...history,
      [currentProfile.profileId]: {
        past: nextPast,
        future: nextFuture,
        lastPushAt: 0,
        lastCoalesceKey: null,
      },
    },
    restored,
  };
}

export function clearProfileHistory(history: HistoryState, profileId: string): HistoryState {
  if (!(profileId in history)) return history;
  const next = { ...history };
  delete next[profileId];
  return next;
}

export function getHistoryFlags(history: HistoryState, profileId: string | null): { canUndo: boolean; canRedo: boolean } {
  if (!profileId) return { canUndo: false, canRedo: false };
  const bucket = history[profileId];
  return {
    canUndo: Boolean(bucket && bucket.past.length > 0),
    canRedo: Boolean(bucket && bucket.future.length > 0),
  };
}
