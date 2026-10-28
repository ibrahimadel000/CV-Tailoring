/** Active v6: four fixed provenance blocks, never variable claim lists.
 * Empty blocks are explicit. No truncation, shape guessing, repair or retry.
 * Provenance validation is NOT semantic certification.
 */
import { z } from 'zod';
import { buildDocumentBrief, documentEditorialInstructions } from './documentEditorial';
import type { CVProfile } from '@/types/schema';
import { CompositionError } from './core';
import { projectGoogleSchema } from './providerContract';
import { referencePolicy, withEntryMetadata } from './references';
import { projectSource } from '../contentEngine/engine';
import { claimReferencePolicy, editorialDocumentSchema, editorialContract, prepareEditorialComposition,
  compileEditorialComposition } from './editorialDocument';

export const FIXED_REVISION = 'document-compose-v6-fixed-summary-blocks';
export const SUMMARY_BLOCK_ORDER = ['profile', 'experience', 'skills', 'qualification'] as const;
// 4 * 599 + 3 joining spaces = 2399, below the native 2400-character budget.
export const SUMMARY_BLOCK_MAX = 599;
const block = z.object({ text: z.string().trim().max(SUMMARY_BLOCK_MAX), sourceIds: z.array(z.string().min(1).max(100)).max(24) }).strict();
export const fixedDocumentSchema = z.object({
  summaryBlocks: z.object({ profile: block, experience: block, skills: block, qualification: block }).strict(),
  entries: editorialDocumentSchema.shape.entries,
  skillSelections: editorialDocumentSchema.shape.skillSelections,
}).strict();
export function fixedContract(source: Parameters<typeof editorialContract>[0]) {
  const legacy = editorialContract(source), policy = claimReferencePolicy(source);
  const { summaryClaims: _unused, ...other } = legacy.properties;
  const properties = Object.fromEntries(SUMMARY_BLOCK_ORDER.map(group => [group, {
    type: 'object', properties: {
      text: { type: 'string', maxLength: SUMMARY_BLOCK_MAX },
      sourceIds: { type: 'array', maxItems: source.locks.summary || !policy[group].length ? 0 : 24,
        items: { type: 'string', ...(policy[group].length ? { enum: [...policy[group]] } : {}) } },
    }, required: ['text', 'sourceIds'], additionalProperties: false,
  }]));
  return { ...legacy, properties: { summaryBlocks: { type: 'object', properties, required: [...SUMMARY_BLOCK_ORDER], additionalProperties: false }, ...other },
    required: ['summaryBlocks', 'entries', 'skillSelections'] };
}
export function prepareFixedComposition(profile: CVProfile, job: string) {
  const p = prepareEditorialComposition(profile, job);
  return { ...p, revision: FIXED_REVISION, summaryBlockOrder: [...SUMMARY_BLOCK_ORDER], documentBrief: buildDocumentBrief(p.source), outputContract: fixedContract(p.source) };
}
export type FixedPacket = ReturnType<typeof prepareFixedComposition>;
export function googleFixedSchema(p: FixedPacket) {
  if (JSON.stringify(p.documentBrief) !== JSON.stringify(buildDocumentBrief(p.source)) || p.revision !== FIXED_REVISION || JSON.stringify(p.summaryBlockOrder) !== JSON.stringify(SUMMARY_BLOCK_ORDER) ||
    JSON.stringify(p.outputContract) !== JSON.stringify(fixedContract(p.source)) ||
    JSON.stringify(p.referencePolicy) !== JSON.stringify(referencePolicy(p.source)) ||
    JSON.stringify(p.claimReferencePolicy) !== JSON.stringify(claimReferencePolicy(p.source)))
    throw new CompositionError('contract', 'Fixed summary contract mismatch. Nothing was sent.');
  return projectGoogleSchema(p.outputContract);
}
export function compileFixedComposition(profile: CVProfile, raw: unknown) {
  const parsed = fixedDocumentSchema.safeParse(raw);
  if (!parsed.success) throw new CompositionError('contract', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'));
  const doc = parsed.data, source = withEntryMetadata(projectSource(profile));
  const policy = claimReferencePolicy(source), claims = [];
  for (const group of SUMMARY_BLOCK_ORDER) {
    const b = doc.summaryBlocks[group], path = `summaryBlocks.${group}`;
    if (source.locks.summary && (b.text || b.sourceIds.length))
      throw new CompositionError('contract', `${path}: summary is locked. Nothing was saved.`);
    if (Boolean(b.text) !== Boolean(b.sourceIds.length))
      throw new CompositionError('contract', `${path}: text and references must both be present or both empty. Nothing was saved.`);
    if (new Set(b.sourceIds).size !== b.sourceIds.length)
      throw new CompositionError('contract', `${path}.sourceIds: duplicate reference IDs. Nothing was saved.`);
    if (b.sourceIds.some(id => !policy[group].includes(id)))
      throw new CompositionError('contract', `${path}.sourceIds: references outside the permitted ${group} group. Nothing was saved.`);
    if (b.text) claims.push({ kind: group, ...b });
  }
  // Exactly four possible blocks -> at most four internal claims. No total-count
  // rejection, merging, dropping or truncation. Shared native checks stay intact.
  return compileEditorialComposition(profile, { summaryClaims: claims, entries: doc.entries, skillSelections: doc.skillSelections }, { collapseDisplayDuplicates: true });
}
// Standalone active instructions: no inherited legacy wire rules or string replacement.
export const fixedInstructions = documentEditorialInstructions;
