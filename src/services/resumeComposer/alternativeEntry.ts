/** Experimental one-response fallback. Text similarity is not an accuracy or quality verdict.
 * An alternative may be used only for an untouched original entry, with one line
 * per original bullet and no change to its overview. The normal local guard runs
 * before selection and again during compilation. No prose is invented here.
 */
import type { Source } from '../contentEngine/engine';
import { guardNaturalDocument, type GuardInput } from './claimGuard';
type Entry = GuardInput['entries'][number];

export function chooseAlternativeEntries(source: Source, data: GuardInput, alternatives: Entry[], summaryMax: number, refsMax: number) {
  const chosen = [...data.entries], selected: string[] = [];
  const facts = new Map(source.evidence.map(f => [f.id, f.text.trim()]));
  const unlocked = [...(source.locks.experience ? [] : source.experience), ...(source.locks.projects ? [] : source.projects)];
  let selectedBullets = 0;
  for (const entry of unlocked) {
    const primary = data.entries.filter(x => x.id === entry.id), options = alternatives.filter(x => x.id === entry.id);
    if (selected.length >= 4 || primary.length !== 1 || options.length !== 1 || !entry.bulletIds.length || entry.bulletIds.length > 12 || selectedBullets + entry.bulletIds.length > 24) continue;
    const original = primary[0], alt = options[0];
    const overviewText = entry.overviewId ? facts.get(entry.overviewId) : '';
    const overviewRefs = entry.overviewId ? [entry.overviewId] : [];
    const isOverview = (p: Entry['overview']) => p.text.trim() === overviewText && JSON.stringify(p.sourceIds) === JSON.stringify(overviewRefs);
    if (!isOverview(original.overview) || !isOverview(alt.overview)) continue;
    // Require exact one-to-one source coverage in BOTH versions: do not accept
    // combined, split, missing, duplicated, borrowed or invented source IDs.
    const exactCoverage = (v: Entry) => v.bullets.length === entry.bulletIds.length && v.bullets.every(b => b.text.trim() && b.sourceIds.length === 1 && entry.bulletIds.includes(b.sourceIds[0])) && new Set(v.bullets.map(b => b.sourceIds[0])).size === entry.bulletIds.length;
    if (!exactCoverage(original) || !exactCoverage(alt)) continue;
    if (!original.bullets.every(b => b.text.trim() === facts.get(b.sourceIds[0]))) continue;
    if (alt.bullets.every(b => b.text.trim() === facts.get(b.sourceIds[0]))) continue;
    const candidateEntries = data.entries.map(e => e.id === entry.id ? alt : e);
    const trial = guardNaturalDocument(source, { ...data, entries: candidateEntries }, summaryMax, refsMax);
    // Any guard intervention or review signal for this alternative disqualifies it.
    if (trial.notes.some(n => n.path === `entries.${entry.id}` || n.path.startsWith(`entries.${entry.id}.`))) continue;
    const guarded = trial.doc.entries.find(e => e.id === entry.id);
    if (!guarded || JSON.stringify(guarded) !== JSON.stringify(alt)) continue;
    chosen[chosen.findIndex(e => e.id === entry.id)] = alt;
    selected.push(entry.id);
    selectedBullets += entry.bulletIds.length;
  }
  return { entries: chosen, selected };
}
