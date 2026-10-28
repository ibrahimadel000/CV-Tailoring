/** v4 intermediate compiler/offline contract. Active network transport uses fixedSummaryDocument v6.
 * Typed provenance is a structural boundary, NOT semantic verification.
 * v3 core remains the native binder/offline replay contract; never a network fallback.
 */
import { z } from 'zod';
import { equivalentSkillKey } from './documentEditorial';
import type { CVProfile, SkillTag } from '@/types/schema';
import type { Source } from '../contentEngine/engine';
import { projectSource } from '../contentEngine/engine';
import { prepareComposition, prepareSourceComposition, compileComposition, compositionInstructions, CompositionError } from './core';
import { withEntryMetadata, boundCompositionContract, referencePolicy } from './references';
import { projectGoogleSchema } from './providerContract';
import type { SkillNormalization } from './skillSelection';

export const EDITORIAL_REVISION = 'document-compose-v4-typed-claims';
const ref = z.string().min(1).max(100);
const paragraph = z.object({ text: z.string().trim().max(2400), sourceIds: z.array(ref).max(24) }).strict();
const claimKind = z.enum(['experience', 'skills', 'qualification', 'profile']);
const category = z.enum(['Technical', 'Tools', 'Soft', 'Languages']);
export const editorialDocumentSchema = z.object({
  summaryClaims: z.array(z.object({ kind: claimKind, text: z.string().trim().min(1).max(1200), sourceIds: z.array(ref).min(1).max(24) }).strict()).max(5),
  entries: z.array(z.object({ id: ref, overview: paragraph, bullets: z.array(paragraph).max(40) }).strict()).max(60),
  skillSelections: z.array(z.object({ id: ref, category }).strict()).max(200),
}).strict();
export type EditorialDocument = z.infer<typeof editorialDocumentSchema>;

export function claimReferencePolicy(source: Source) {
  return {
    experience: source.evidence.filter(f => ['role', 'achievement', 'project'].includes(f.kind) && f.parent).map(f => f.id),
    skills: [...source.skillIds],
    qualification: source.evidence.filter(f => ['education', 'certification'].includes(f.kind)).map(f => f.id),
    profile: source.evidence.filter(f => ['summary', 'headline'].includes(f.kind) || (f.kind === 'context' && !f.parent)).map(f => f.id),
  };
}
export function editorialContract(source: Source) {
  const legacy = boundCompositionContract(source), policy = claimReferencePolicy(source);
  const refs = Object.values(policy).flat();
  return {
    type: 'object', properties: {
      summaryClaims: { type: 'array', maxItems: source.locks.summary ? 0 : 5, items: { type: 'object', properties: {
        kind: { type: 'string', enum: [...claimKind.options] }, text: { type: 'string', minLength: 1, maxLength: 1200 },
        sourceIds: { type: 'array', minItems: 1, maxItems: 24, items: { type: 'string', ...(refs.length ? { enum: [...new Set(refs)] } : {}) } },
      }, required: ['kind', 'text', 'sourceIds'], additionalProperties: false } },
      entries: legacy.properties.entries,
      skillSelections: { type: 'array', maxItems: source.locks.skills ? 0 : 200, items: { type: 'object', properties: {
        id: { type: 'string', ...(source.skillIds.length ? { enum: [...source.skillIds] } : {}) }, category: { type: 'string', enum: [...category.options] },
      }, required: ['id', 'category'], additionalProperties: false } },
    }, required: ['summaryClaims', 'entries', 'skillSelections'], additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  };
}
function editorialPacket(legacy: ReturnType<typeof prepareComposition>) {
  return { revision: EDITORIAL_REVISION, source: legacy.source, job: legacy.job, referencePolicy: legacy.referencePolicy,
    claimReferencePolicy: claimReferencePolicy(legacy.source), outputContract: editorialContract(legacy.source) };
}
export const prepareEditorialComposition = (profile: CVProfile, job: string) => editorialPacket(prepareComposition(profile, job));
export const prepareSourceEditorialComposition = (source: Source, job: string) => editorialPacket(prepareSourceComposition(source, job));
export type EditorialPacket = ReturnType<typeof prepareEditorialComposition>;
export function googleEditorialSchema(packet: EditorialPacket) {
  if (packet.revision !== EDITORIAL_REVISION || JSON.stringify(packet.outputContract) !== JSON.stringify(editorialContract(packet.source)) ||
    JSON.stringify(packet.referencePolicy) !== JSON.stringify(referencePolicy(packet.source)) ||
    JSON.stringify(packet.claimReferencePolicy) !== JSON.stringify(claimReferencePolicy(packet.source))) throw new CompositionError('contract', 'Editorial contract mismatch. Nothing was sent.');
  return projectGoogleSchema(packet.outputContract);
}
const key = (s: string) => s.normalize('NFC').toLowerCase().trim().replace(/\s+/gu, ' ').replace(/\s*\/\s*/gu, '/');
function selectedSkills(source: Source, selections: EditorialDocument['skillSelections'], collapseDisplayDuplicates = false) {
  const ids = selections.map(s => s.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !source.skillIds.includes(id))) throw new CompositionError('contract', 'Unknown or repeated skill ID. Nothing was saved.');
  const seen = new Map<string, string>(), selected: typeof selections = [], normalizations: SkillNormalization[] = [];
  for (const selection of selections) {
    const fact = source.evidence.find(f => f.id === selection.id)!;
    // Explicit output categories are presentation decisions, not imported truth.
    // Original qualification/group differences and full native levels remain protected.
    const context = (source.originalSkillContexts || []).filter(g => g.skillIds.includes(selection.id)).map(g => JSON.stringify([key(g.sectionTitle), key(g.groupTitle)])).sort();
    const signature = collapseDisplayDuplicates ? equivalentSkillKey(source, selection.id) : JSON.stringify([key(fact.text), selection.category, context]);
    const retainedId = seen.get(signature);
    if (retainedId) normalizations.push({ omittedId: selection.id, retainedId, reason: collapseDisplayDuplicates ? 'Equivalent full skill text/level and original context across display categories; retained the first selected native skill and its chosen category without renaming.' : 'Equivalent full skill text/level, chosen display category and original context; retained the first selected native skill without renaming.' });
    else { seen.set(signature, selection.id); selected.push(selection); }
  }
  return { selected, normalizations };
}
export function compileEditorialComposition(profile: CVProfile, raw: unknown, options: { collapseDisplayDuplicates?: boolean } = {}) {
  const parsed = editorialDocumentSchema.safeParse(raw);
  if (!parsed.success) throw new CompositionError('contract', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'));
  const doc = parsed.data, source = withEntryMetadata(projectSource(profile)), policy = claimReferencePolicy(source);
  if (source.locks.summary && doc.summaryClaims.length) throw new CompositionError('contract', 'Locked summary requires no generated claims.');
  if (source.locks.skills && doc.skillSelections.length) throw new CompositionError('contract', 'Locked skills require no generated selections.');
  for (const [i, claim] of doc.summaryClaims.entries()) {
    if (new Set(claim.sourceIds).size !== claim.sourceIds.length || claim.sourceIds.some(id => !policy[claim.kind].includes(id))) throw new CompositionError('contract', `summaryClaims.${i}: references do not match the declared claim kind. Skill listings cannot establish performed work.`);
  }
  // Preserve at least one real narrative contribution per nonempty original entry.
  // This is not an importance score; empty original entries can remain empty.
  for (const entry of doc.entries) {
    const original = [...source.experience, ...source.projects].find(e => e.id === entry.id);
    if (original && (original.overviewId || original.bulletIds.length) && !entry.overview.text && !entry.bullets.some(b => b.text)) throw new CompositionError('contract', 'A nonempty original entry lost every narrative contribution. Nothing was saved.');
  }
  const normalized = selectedSkills(source, doc.skillSelections, options.collapseDisplayDuplicates);
  const result = compileComposition(profile, {
    summary: { text: doc.summaryClaims.map(c => c.text).join(' '), sourceIds: [...new Set(doc.summaryClaims.flatMap(c => c.sourceIds))] },
    entries: doc.entries, skillIds: normalized.selected.map(s => s.id),
  }, { normalizeSkills: false });
  if (!profile.skills.isLocked) {
    // The native shape/renderer/storage stays unchanged. Bind native IDs/names/levels
    // exactly, then apply only the explicit bounded display classification.
    const categories = new Map(normalized.selected.map(s => [s.id, s.category]));
    result.candidate.skills.data = result.candidate.skills.data.map(skill => {
      const index = profile.skills.data.findIndex(s => s.id === skill.id), id = `skill_${index + 1}`;
      return { ...skill, category: categories.get(id)! as SkillTag['category'] };
    });
  }
  for (const n of normalized.normalizations) {
    const omitted = result.draft.omittedSkills.find(s => s.sourceId === n.omittedId);
    if (omitted) omitted.reason = n.reason;
  }
  return { ...result, normalizations: normalized.normalizations, summaryClaims: doc.summaryClaims };
}

export const editorialInstructions = compositionInstructions + `
ACTIVE OUTPUT CONTRACT IS v4: do not output the v3 summary or skillIds fields. Return summaryClaims, entries and skillSelections only. This is one final document, not a separate plan, scoring report, or review.
Build the summary from short, distinct claim units. Each unit has kind and its own supporting sourceIds from claimReferencePolicy: experience for work/project narrative, skills for listed abilities, qualification for education/certificates, profile for existing profile/headline/general context. These are provenance types, not a rating of the person's honesty. Do not use a skills or profile claim to disguise a new employer-experience assertion. Keep listed technologies in a clearly worded skills clause/sentence; do not attach them to a particular employer, project, contribution or measured result unless that narrative explicitly names them. Adjacent claims must not imply that missing relationship either. Each unit must read naturally when joined with a single space. Avoid duplicating the same strength across units. No requirement to use every kind; a short strong summary is better than filling five slots. Respect source language.
The summary is an introduction, not a compressed copy of the experience section or a catalogue of skills. Lead with the supported professional identity and the strongest evidence relevant to the most important target responsibilities. Synthesize contributions rather than pasting source bullets into the introduction. Do not repeat complete achievement sentences that appear in the work entries. Mention a small, purposeful set of technologies only when it helps explain the target fit; the skills section carries the detailed inventory. Do not fill space with broad praise or repeat qualifications across multiple claims. This is a writing objective, not a mandatory sentence count, length quota or requirement to rewrite every source sentence.
Order work highlights by their supported relevance to the target, not by the order they arrived in the source. Preserve an already strong original bullet when it communicates the contribution well. Distinguish engineering workflow improvement from application runtime performance, debugging and automated testing; one does not establish the others. The target describes what to emphasize, never facts to add to the candidate.
Make real editorial selection decisions for the WHOLE document. The complete source is supplied for context, not a requirement to copy every skill. Include the skills that materially support this target and a small amount of useful adjacent context; omit unrelated specialisms or repeated labels from the tailored copy. Do not impose an arbitrary skill quota, keyword count or universal one-page rule. Retain important limitations and qualifications. Keep at least one supported narrative contribution for every nonempty original work/project entry; do not leave an empty career header. A relevant original contribution may stay unchanged. Improve clarity/concision only when useful; do not append generic relevance phrases, praise or unsupported technology names to work bullets.
Each skillSelections item is an existing ID with one native display category: Languages for programming languages, Tools for concrete tools/platforms/frameworks, Technical for technical concepts, engineering methods and professional domain methods, Soft for genuinely interpersonal capabilities. Imported/editor categories are hints and may be wrong. Classification is a display decision, not proof of proficiency. A combined source label cannot be split or renamed: choose the best category for the whole label. Select an equivalent duplicate once; protect different levels, qualifications and meaningful original contexts. Do not keep unrelated growth/marketing content just because it exists in SOURCE when the target is engineering (or vice versa). This example is not a rule to drop marketing for relevant jobs.
The application derives omissions and groups selected skills for display. Groups follow the first selected skill of each category, with selected order preserved inside each group; interleaved categories do not remain a global flat list. Put the most relevant group first by selecting one of its skills first. Do not produce an explanation artifact, new headings, section edits or layout instructions. Do not copy preserved education/certifications into the summary unless specifically relevant. Read the resulting document for information density and repeated ideas before returning. Structural acceptance is not factual or editorial verification. No automatic repair or second request.
`;
