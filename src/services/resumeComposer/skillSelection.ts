/** Conservative presentation normalization, NOT skill synonym inference. */
import type { Source } from '../contentEngine/engine';
const key = (text: string) => text.normalize('NFC').toLowerCase().trim().replace(/\s+/gu, ' ').replace(/\s*\/\s*/gu, '/');
export type SkillNormalization = { omittedId: string; retainedId: string; reason: string };
export function normalizeSelectedSkills(source: Source, selected: string[]) {
  if (source.locks.skills) return { skillIds: [...selected], normalizations: [] as SkillNormalization[] };
  const facts = new Map(source.evidence.map(f => [f.id, f]));
  const contexts = (id: string) => [
    ...(source.originalSkillContexts || []).filter(g => g.skillIds.includes(id)).map(g => 'original:' + JSON.stringify([key(g.sectionTitle), key(g.groupTitle)])),
    ...(source.skillGroups || []).filter(g => g.skillIds.includes(id)).map(g => 'group:' + JSON.stringify([key(g.sectionTitle), key(g.groupTitle)])),
  ].sort();
  const seen = new Map<string, string>(), skillIds: string[] = [], normalizations: SkillNormalization[] = [];
  for (const id of selected) {
    const fact = facts.get(id);
    if (!source.skillIds.includes(id) || !fact || fact.kind !== 'skill') throw Error('Unknown selected skill; normalization cannot repair invalid IDs.');
    // Full text includes any native level. Category and recovered context matter:
    // equal names with different qualifications/groups are not safe to collapse.
    const signature = JSON.stringify([key(fact.text), fact.profileCategory || '', contexts(id)]);
    const retainedId = seen.get(signature);
    if (retainedId) normalizations.push({ omittedId: id, retainedId, reason: 'Equivalent selected skill text (including level), category and source-group context; first selected native skill retained unchanged.' });
    else { seen.set(signature, id); skillIds.push(id); }
  }
  return { skillIds, normalizations };
}
