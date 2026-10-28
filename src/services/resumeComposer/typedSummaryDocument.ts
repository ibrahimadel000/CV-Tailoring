/** Active v5 wire contract. Group membership binds reference type at generation
 * and compilation. This is provenance validation, not semantic certification.
 * No legacy-response detection, automatic reclassification, repair or retry.
 */
import { z } from 'zod';
import type { CVProfile } from '@/types/schema';
import { CompositionError } from './core';
import { projectGoogleSchema } from './providerContract';
import { referencePolicy, withEntryMetadata } from './references';
import { projectSource } from '../contentEngine/engine';
import { claimReferencePolicy, editorialDocumentSchema, editorialContract, prepareEditorialComposition,
  compileEditorialComposition, editorialInstructions } from './editorialDocument';

export const GROUPED_REVISION = 'document-compose-v5-bound-summary-groups';
export const SUMMARY_GROUP_ORDER = ['profile', 'experience', 'skills', 'qualification'] as const;
const claim = z.object({ text: z.string().trim().min(1).max(1200), sourceIds: z.array(z.string().min(1).max(100)).min(1).max(24) }).strict();
export const groupedDocumentSchema = z.object({
  summaryClaims: z.object({ profile: z.array(claim).max(5), experience: z.array(claim).max(5), skills: z.array(claim).max(5), qualification: z.array(claim).max(5) }).strict(),
  entries: editorialDocumentSchema.shape.entries,
  skillSelections: editorialDocumentSchema.shape.skillSelections,
}).strict();

export function groupedContract(source: Parameters<typeof editorialContract>[0]) {
  const legacy = editorialContract(source), policy = claimReferencePolicy(source);
  const properties = Object.fromEntries(SUMMARY_GROUP_ORDER.map(group => [group, {
    type: 'array', maxItems: source.locks.summary || !policy[group].length ? 0 : 5,
    items: { type: 'object', properties: {
      text: { type: 'string', minLength: 1, maxLength: 1200 },
      sourceIds: { type: 'array', minItems: 1, maxItems: 24,
        items: { type: 'string', ...(policy[group].length ? { enum: [...policy[group]] } : {}) } },
    }, required: ['text', 'sourceIds'], additionalProperties: false },
  }]));
  return { ...legacy, properties: { ...legacy.properties,
    summaryClaims: { type: 'object', properties, required: [...SUMMARY_GROUP_ORDER], additionalProperties: false },
  } };
}
export function prepareGroupedComposition(profile: CVProfile, job: string) {
  const prepared = prepareEditorialComposition(profile, job);
  return { ...prepared, revision: GROUPED_REVISION, summaryGroupOrder: [...SUMMARY_GROUP_ORDER], outputContract: groupedContract(prepared.source) };
}
export type GroupedPacket = ReturnType<typeof prepareGroupedComposition>;
export function googleGroupedSchema(packet: GroupedPacket) {
  if (packet.revision !== GROUPED_REVISION || JSON.stringify(packet.summaryGroupOrder) !== JSON.stringify(SUMMARY_GROUP_ORDER) ||
    JSON.stringify(packet.outputContract) !== JSON.stringify(groupedContract(packet.source)) ||
    JSON.stringify(packet.referencePolicy) !== JSON.stringify(referencePolicy(packet.source)) ||
    JSON.stringify(packet.claimReferencePolicy) !== JSON.stringify(claimReferencePolicy(packet.source)))
    throw new CompositionError('contract', 'Grouped summary contract mismatch. Nothing was sent.');
  return projectGoogleSchema(packet.outputContract);
}
export function compileGroupedComposition(profile: CVProfile, raw: unknown) {
  const parsed = groupedDocumentSchema.safeParse(raw);
  if (!parsed.success) throw new CompositionError('contract', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'));
  const doc = parsed.data;
  const source = withEntryMetadata(projectSource(profile));
  const policy = claimReferencePolicy(source), claims = [];
  for (const group of SUMMARY_GROUP_ORDER) {
    if (profile.summary.isLocked && doc.summaryClaims[group].length)
      throw new CompositionError('contract', `summaryClaims.${group}: summary is locked. Nothing was saved.`);
    for (const [i, c] of doc.summaryClaims[group].entries()) {
      const path = `summaryClaims.${group}.${i}.sourceIds`;
      if (new Set(c.sourceIds).size !== c.sourceIds.length)
        throw new CompositionError('contract', `${path}: duplicate reference IDs. Nothing was saved.`);
      if (!policy[group].length || c.sourceIds.some(id => !policy[group].includes(id)))
        throw new CompositionError('contract', `${path}: references outside the permitted ${group} group. Nothing was saved.`);
      claims.push({ kind: group, ...c });
    }
  }
  if (claims.length > 5) throw new CompositionError('contract', 'summaryClaims: more than five claims across all groups. Nothing was saved.');
  // Explicit, versioned wire-to-native projection, NOT guessing a response type.
  // The existing native compiler still enforces locks, scope and all content limits.
  return compileEditorialComposition(profile, { summaryClaims: claims, entries: doc.entries, skillSelections: doc.skillSelections });
}
const v5Base = editorialInstructions
  .replace('ACTIVE OUTPUT CONTRACT IS v4: do not output the v3 summary or skillIds fields. Return summaryClaims, entries and skillSelections only.', 'ACTIVE OUTPUT CONTRACT IS v5. Return summaryClaims as an object with all four arrays: profile, experience, skills, qualification; entries and skillSelections remain required. Never return a summaryClaims array or a kind field.')
  .replace('Each unit has kind and its own supporting sourceIds from claimReferencePolicy:', 'Each unit has text and supporting sourceIds, and belongs to exactly one named array from claimReferencePolicy:');
export const groupedInstructions = v5Base + `
BOUND SUMMARY GROUPS: summaryClaims is {profile:[],experience:[],skills:[],qualification:[]}. Every array is required; leave unused or unavailable groups empty. Each item contains only text and sourceIds. Use only IDs from claimReferencePolicy for THAT group, as bounded by its own outputContract enum. Do not copy an ID across evidence kinds, repeat IDs in one item, or invent a new reference. There is no independently chosen kind field. Total summary claims across groups must be at most five; fewer are often better. The native introduction joins groups in summaryGroupOrder (profile, experience, skills, qualification), preserving order inside each group. Do not fill every group or write transition text that presumes an empty group. A summary lock requires all four arrays empty. Empty groups are not missing candidate facts. These structural rules do not prove the sentence's meaning; factual attribution rules still apply. No automatic repair or second request.
`;
