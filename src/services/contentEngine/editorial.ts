import { z } from 'zod';
import { editorialPlanSchema, EDITORIAL_SKILL_REASON_LIMIT, EDITORIAL_NOTE_LIMIT, type EditorialPlan } from '@/types/editorial';
import { selectionSchema, validateSelection, normalizeSelection, writerPacket, realizationSchema, materialize, type Selection } from './pipeline';
import type { Source, Issue } from './engine';
const envelope = z.object({ selection: selectionSchema, editorial: editorialPlanSchema }).strict();
const unique = (ids: string[]) => new Set(ids).size === ids.length;
const whitespace = (s: string) => s.replace(/\s+/g, ' ').trim();
export function validateEditorial(s: Source, job: string, raw: unknown) {
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) return { value: null, issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) };
  const { selection, editorial: e } = parsed.data;
  // Zod inserts an empty default; it is not a model-authored legacy grouping.
  const toCheck: Record<string, unknown> = { ...selection };
  if (!selection.skillGroups.length) delete toCheck.skillGroups;
  const checked = validateSelection(s, toCheck), issues: Issue[] = [...checked.issues];
  const add = (path: string, message: string) => issues.push({ path, message });
  if (!checked.selection || issues.length) return { value: null, issues };
  const v = checked.selection, facts = new Map(s.evidence.map(f => [f.id, f])), priorities = e.jobFocus.priorities.map(p => p.id);
  if (!unique(priorities)) add('jobFocus.priorities', 'Priority identities must be unique.');
  e.jobFocus.priorities.forEach(p => { if (!whitespace(job).includes(whitespace(p.quote))) add('jobFocus.priorities.' + p.id, 'Quote must be an exact passage of the supplied job, allowing whitespace only.'); });
  const contextKinds = ['headline', 'education', 'certification', 'context'];
  if (!unique(e.summary.contextIds) || e.summary.contextIds.some(id => !contextKinds.includes(facts.get(id)?.kind || ''))) add('summary.contextIds', 'Use distinct existing headline, education, certification or professional context references only.');
  if (!unique(e.summary.skillIds) || e.summary.skillIds.some(id => !v.skillOrder.includes(id))) add('summary.skillIds', 'Only distinct selected skills may guide summary writing.');
  if (s.locks.summary && (e.summary.angle || e.summary.contextIds.length || e.summary.skillIds.length)) add('summary', 'Locked summary permits no new writing direction or evidence.');
  const allowed = new Set([...v.entries.flatMap(x => x.passageIds), ...v.skillOrder, ...e.summary.contextIds, ...s.evidence.filter(f => f.kind === 'headline').map(f => f.id)]);
  const inspect = (ids: string[], path: string) => { if (!unique(ids) || ids.some(id => !allowed.has(id))) add(path, 'Only distinct retained source facts may support this editorial hypothesis.'); };
  inspect(e.positioning.sourceIds, 'positioning.sourceIds');
  if (!e.positioning.sourceIds.length && allowed.size) add('positioning.sourceIds', 'Positioning must point to existing retained source evidence.');
  if (!unique(e.priorityLinks.map(x => x.priorityId)) || e.priorityLinks.length !== priorities.length || e.priorityLinks.some(x => !priorities.includes(x.priorityId))) add('priorityLinks', 'Each job priority needs one source-link or explicit no-evidence note.');
  e.priorityLinks.forEach(p => inspect(p.sourceIds, 'priorityLinks.' + p.priorityId));
  const entries = [...s.experience, ...s.projects];
  if (e.entries.length !== entries.length || e.entries.some((x, i) => x.id !== entries[i]?.id)) add('editorial.entries', 'Keep every original entry identity and order.');
  e.entries.forEach(x => { const selected = v.entries.find(a => a.id === x.id); if (!unique(x.leadPassageIds) || x.leadPassageIds.some(id => !selected?.passageIds.includes(id))) add('entries.' + x.id, 'Lead passages must belong to this retained entry.'); });
  if (!unique(e.skills.map(x => x.id)) || e.skills.length !== s.skillIds.length || e.skills.some(x => !s.skillIds.includes(x.id))) add('editorial.skills', 'Every original skill needs exactly one editorial decision.');
  e.skills.forEach(x => {
    const path = 'skills.' + x.id;
    if ((x.tier === 'omit') !== v.omittedSkillIds.includes(x.id)) add(path + '.tier', 'skill_selection_conflict: Tier must agree with actual selection.');
    if (!unique(x.priorityIds)) add(path + '.priorityIds', 'duplicate_priority_reference: Priority references must not repeat.');
    if (x.priorityIds.some(id => !priorities.includes(id))) add(path + '.priorityIds', 'unknown_priority_reference: A linked priority does not exist in jobFocus.priorities.');
    if (!s.locks.skills && x.tier === 'core' && !x.priorityIds.length) add(path + '.priorityIds', 'core_priority_missing: A core skill needs at least one explicit job priority. Supporting context may have no direct link.');
  });
  const omitted = v.entries.flatMap(x => x.omittedIds);
  if (!unique(e.omissions.map(x => x.id)) || e.omissions.length !== omitted.length || e.omissions.some(x => !omitted.includes(x.id))) add('omissions', 'Explain every omitted entry passage once; do not relabel selected facts as omissions.');
  return { value: issues.length ? null : { selection: v, editorial: e }, issues };
}
export function normalizeEditorial(s: Source, job: string, raw: unknown) {
  const checked = validateEditorial(s, job, raw); if (!checked.value) return { ...checked, duplicates: [] };
  const normalized = normalizeSelection(s, checked.value.selection), e: EditorialPlan = JSON.parse(JSON.stringify(checked.value.editorial));
  const remap = (ids: string[]) => [...new Set(ids.map(id => normalized.duplicates.find(d => d.sourceId === id)?.retainedId || id))];
  e.positioning.sourceIds = remap(e.positioning.sourceIds); e.summary.skillIds = remap(e.summary.skillIds);
  e.priorityLinks.forEach(p => { p.sourceIds = remap(p.sourceIds); });
  for (const d of normalized.duplicates) { const x = e.skills.find(x => x.id === d.sourceId)!; x.tier = 'omit'; x.priorityIds = []; x.reason = `Local text-equivalent duplicate of ${d.retainedId}; the original remains available.`; }
  return { ...validateEditorial(s, job, { selection: normalized.selection, editorial: e }), duplicates: normalized.duplicates };
}
export function editorialWriterPacket(s: Source, selection: Selection, e: EditorialPlan, job: string) {
  // The plan is reviewed model-authored direction, not a second source of candidate facts.
  const packet = writerPacket(s, selection, job), map = new Map(s.evidence.map(f => [f.id, f]));
  return { ...packet, direction: { ...packet.direction, jobFocus: e.jobFocus, positioning: e.positioning, summaryAngle: e.summary.angle, entryAngles: e.entries },
    listedSkills: packet.listedSkills.filter(f => e.summary.skillIds.includes(f.id)).map(({ originalGroups: _editorGroups, ...f }) => ({ ...f,
      originalGroups: (s.originalSkillContexts || []).filter(g => g.skillIds.includes(f.id)).map(({ sectionTitle, groupTitle }) => ({ sectionTitle, groupTitle })),
      editorCategory: (s.skillGroups || []).filter(g => g.skillIds.includes(f.id)).map(g => g.groupTitle || g.sectionTitle) })),
    summaryContext: e.summary.contextIds.map(id => ({ id, kind: map.get(id)!.kind, text: map.get(id)!.text, role: 'source_context_not_employer_practice' })) };
}
export function materializeEditorial(s: Source, selection: Selection, e: EditorialPlan, raw: unknown) {
  const parsed = realizationSchema.safeParse(raw), allowed = new Set([...selection.summaryWorkIds, ...e.summary.skillIds, ...e.summary.contextIds]);
  if (parsed.success && parsed.data.summary.sourceIds.some(id => !allowed.has(id))) return { draft: null, issues: [{ path: 'summary', message: 'Summary references evidence outside its agreed editorial writing unit.' }] };
  const result = materialize(s, selection, raw, e.summary.contextIds, e.summary.skillIds);
  if (result.draft) {
    for (const entry of [...result.draft.experience, ...result.draft.projects]) for (const x of entry.omitted) x.reason = e.omissions.find(o => o.id === x.sourceId)!.reason;
    for (const x of result.draft.omittedSkills) x.reason = e.skills.find(o => o.id === x.sourceId)!.reason;
  }
  return result;
}
const str = { type: 'STRING' }, noteText = { ...str, description: `Concise editorial note, normally within 480 characters; application hard limit ${EDITORIAL_NOTE_LIMIT} characters. Not new candidate evidence.` }, arr = (items: unknown) => ({ type: 'ARRAY', items }), obj = (properties: Record<string, unknown>) => ({ type: 'OBJECT', properties, required: Object.keys(properties) });
export const editorialOutputSchema = obj({ selection: obj({ summaryWorkIds: arr(str), entries: arr(obj({ id: str, passageIds: arr(str), omittedIds: arr(str) })), skillOrder: arr(str), omittedSkillIds: arr(str) }), editorial: obj({
  version: { type: 'STRING', enum: ['editorial-b29'] }, jobFocus: obj({ purpose: noteText, priorities: arr(obj({ id: str, description: noteText, quote: { ...str, description: 'Exact short quote from the job, 8 to 400 characters.' } })) }),
  positioning: obj({ text: noteText, sourceIds: arr(str) }), summary: obj({ angle: noteText, contextIds: arr(str), skillIds: arr(str) }),
  priorityLinks: arr(obj({ priorityId: str, sourceIds: arr(str), note: noteText })), entries: arr(obj({ id: str, angle: noteText, leadPassageIds: arr(str) })),
  skills: arr(obj({ id: str, tier: { type: 'STRING', enum: ['core', 'supporting', 'omit'] }, priorityIds: arr(str), reason: { ...str, description: `Explain this decision briefly, normally within 240 characters. Application hard limit: ${EDITORIAL_SKILL_REASON_LIMIT} characters. No new candidate claims.` } })), omissions: arr(obj({ id: str, reason: noteText }))
}) });

export function editorialAdvisories(plan: EditorialPlan) {
  return plan.skills.filter(x => x.tier === 'supporting' && !x.priorityIds.length).map(x => `${x.id}: Retained as supporting context without a direct job-priority link; not evidence of requirement coverage. Review whether it earns its space. Reason: ${x.reason}`);
}
