import { z } from 'zod';
// Explanatory text is not a candidate claim. Keep it bounded without a brittle UI-sized cutoff.
export const EDITORIAL_NOTE_LIMIT = 2400;
export const EDITORIAL_SKILL_REASON_LIMIT = EDITORIAL_NOTE_LIMIT;
const ref = z.string().min(1).max(100), refs = z.array(ref).max(24), note = z.string().trim().min(3).max(EDITORIAL_NOTE_LIMIT);
// A model-authored editorial hypothesis, never an independent verification of claims.
export const editorialPlanSchema = z.object({
  version: z.literal('editorial-b29'),
  jobFocus: z.object({ purpose: note, priorities: z.array(z.object({ id: z.string().regex(/^p[1-9]\d?$/), description: note, quote: z.string().trim().min(8).max(400) }).strict()).min(1).max(6) }).strict(),
  positioning: z.object({ text: note, sourceIds: refs }).strict(),
  summary: z.object({ angle: z.string().trim().max(EDITORIAL_NOTE_LIMIT), contextIds: z.array(ref).max(8), skillIds: z.array(ref).max(12) }).strict(),
  priorityLinks: z.array(z.object({ priorityId: ref, sourceIds: refs, note }).strict()).min(1).max(6),
  entries: z.array(z.object({ id: ref, angle: z.string().trim().max(EDITORIAL_NOTE_LIMIT), leadPassageIds: z.array(ref).max(8) }).strict()).max(60),
  skills: z.array(z.object({ id: ref, tier: z.enum(['core', 'supporting', 'omit']), priorityIds: z.array(ref).max(6), reason: z.string().trim().min(3).max(EDITORIAL_SKILL_REASON_LIMIT) }).strict()).max(200),
  omissions: z.array(z.object({ id: ref, reason: z.string().trim().min(3).max(EDITORIAL_NOTE_LIMIT) }).strict()).max(200),
}).strict();
export type EditorialPlan = z.infer<typeof editorialPlanSchema>;
