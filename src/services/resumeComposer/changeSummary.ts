/**
 * Factual comparison of the native source and resulting copy at generation
 * time. This does not measure quality, relevance, entailment or factuality.
 */
import type { CVProfile, CompositionChanges } from '@/types/schema';
import type { Source } from '../contentEngine/engine';

type Entry = { id: string; description?: string; bullets: { text: string }[] };
type EntryChange = CompositionChanges['experience'];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Count exact-text differences in the first AI entry for each unlocked source
 * entry. No response text is retained. This is not an editorial or truth score. */
export function summarizeProposal(
  source: Source,
  document: { entries: { id: string; bullets: { text: string }[] }[] },
): { proposed: number; different: number } {
  const entries = [
    ...(source.locks.experience ? [] : source.experience),
    ...(source.locks.projects ? [] : source.projects),
  ];
  const facts = new Map(source.evidence.map(f => [f.id, f.text.trim()]));
  const seen = new Set<string>();
  let proposed = 0, different = 0;
  for (const entry of document.entries) {
    const original = entries.find(e => e.id === entry.id);
    if (!original || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const originalTexts = new Set([original.overviewId, ...original.bulletIds]
      .filter((id): id is string => !!id).map(id => facts.get(id)).filter((text): text is string => !!text));
    for (const line of entry.bullets) {
      const text = line.text.trim();
      if (!text) continue;
      proposed++;
      if (!originalTexts.has(text)) different++;
    }
  }
  return { proposed, different };
}

function entriesChanged(before: readonly Entry[], after: readonly Entry[]): EntryChange {
  if (!before.length && !after.length) return 'empty';
  const contents = (entries: readonly Entry[], sorted: boolean) => entries.map(e => ({
    id: e.id, description: e.description || '',
    bullets: sorted ? e.bullets.map(b => b.text).sort() : e.bullets.map(b => b.text),
  })).sort((a, b) => a.id.localeCompare(b.id));
  if (!same(contents(before, true), contents(after, true))) return 'edited';
  const oldIds = before.map(e => e.id), newIds = after.map(e => e.id);
  return same(oldIds, newIds) && same(contents(before, false), contents(after, false)) ? 'unchanged' : 'reordered';
}

export function summarizeChanges(before: CVProfile, after: CVProfile): CompositionChanges {
  const oldSkills = before.skills.data, newSkills = after.skills.data;
  const oldIds = new Set(oldSkills.map(s => s.id)), newIds = new Set(newSkills.map(s => s.id));
  const retained = oldSkills.filter(s => newIds.has(s.id));
  const selectedOrder = newSkills.filter(s => oldIds.has(s.id)).map(s => s.id);
  const oldById = new Map(oldSkills.map(s => [s.id, s]));
  return {
    summary: before.summary.data === after.summary.data ? 'unchanged' : 'changed',
    experience: entriesChanged(before.experience.data, after.experience.data),
    projects: entriesChanged(before.projects.data, after.projects.data),
    skills: {
      retained: retained.length,
      excluded: oldSkills.filter(s => !newIds.has(s.id)).map(s => ({ name: s.name, ...(s.level ? { level: s.level } : {}) })),
      added: newSkills.filter(s => !oldIds.has(s.id)).length,
      reordered: !same(retained.map(s => s.id), selectedOrder),
      regrouped: newSkills.some(s => oldById.has(s.id) && oldById.get(s.id)!.category !== s.category),
    },
  };
}