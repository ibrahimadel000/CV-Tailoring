export type TailoredResultMetadata = {
  compositionChanges?: unknown;
  tailoring?: { sourceProfileId?: unknown };
};

// Current composition copies and older legacy copies use different metadata
// shapes. Keep checklist visibility independent of either representation.
export function hasTailoredResult(profile: TailoredResultMetadata | null | undefined): boolean {
  return Boolean(profile?.compositionChanges || profile?.tailoring?.sourceProfileId);
}
