/** An explicit listed-capability channel, NOT evidence of performed work.
 * Only native source text is rendered; model prose cannot add proficiency,
 * tools-to-employer relationships, verbs, metrics or missing qualifications.
 */
import type { Source } from '../contentEngine/engine';
import { equivalentSkillKey } from './documentEditorial';
import { CompositionError } from './core';
export const SUMMARY_CAPABILITY_MAX = 4;
export function renderSummaryCapabilities(source: Source, ids: readonly string[], selectedIds: readonly string[]) {
  if (source.locks.summary && ids.length) throw new CompositionError('contract', 'Locked summary requires no capability selections.');
  if (ids.length > SUMMARY_CAPABILITY_MAX || new Set(ids).size !== ids.length)
    throw new CompositionError('contract', 'Summary capabilities exceed the limit or repeat an ID.');
  const seen = new Set<string>();
  const items = ids.map(id => {
    const fact = source.evidence.find(f => f.id === id);
    if (!source.skillIds.includes(id) || fact?.kind !== 'skill' || (!source.locks.skills && !selectedIds.includes(id)))
      throw new CompositionError('contract', 'Summary capability must be an existing retained skill.');
    const key = equivalentSkillKey(source, id);
    if (seen.has(key)) throw new CompositionError('contract', 'Summary capabilities repeat an equivalent skill.');
    seen.add(key);
    // Original contexts can carry qualifications absent from the display name.
    const contexts = [...new Set((source.originalSkillContexts || []).filter(g => g.skillIds.includes(id))
      .map(g => [g.sectionTitle, g.groupTitle].filter(Boolean).join(' / ')))];
    return fact.text + (contexts.length ? ` [${contexts.join('; ')}]` : '');
  });
  // Explicit UI-language label separates a listing from authored practice claims.
  return { text: items.length ? `Relevant skills: ${items.join('; ')}.` : '', sourceIds: [...ids] };
}
