export type TailoredResultMetadata = {
  compositionChanges?: unknown;
  tailoring?: { sourceProfileId?: unknown };
  baseProfileId?: unknown;
  targetJob?: unknown;
  matchScore?: unknown;
};

// Current composition copies and older legacy copies use different metadata
// shapes. Keep checklist visibility independent of either representation.
export function hasTailoredResult(profile: TailoredResultMetadata | null | undefined): boolean {
  const olderTailoring = Boolean(profile?.baseProfileId && (
    (typeof profile.targetJob === 'string' && profile.targetJob.trim()) || typeof profile.matchScore === 'number'
  ));
  return Boolean(profile?.compositionChanges || profile?.tailoring?.sourceProfileId || olderTailoring);
}
