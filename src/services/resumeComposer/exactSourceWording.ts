/**
 * Optional source-wording projection after normal compilation. The source is
 * not fact-checked, and model-suggested ordering is not verified for meaning.
 * Provider wording is never copied into the preserved native sections.
 */
import type { CVProfile } from '@/types/schema';
import { validateDraft, type Source } from '../contentEngine/engine';
import { CompositionError } from './core';
import { chooseAlternativeEntries } from './alternativeEntry';
import { NATURAL_REFS_MAX, NATURAL_SUMMARY_MAX, type NaturalDocument, type compileNaturalComposition } from './naturalDocument';

type Compiled = ReturnType<typeof compileNaturalComposition>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// Reject source projections that exceed the existing draft bounds before sending
// anything. This is a structural check, not a judgment of the source content.
export function assertExactSourceFits(source: Source): void {
  const facts = new Map(source.evidence.map(f => [f.id, f.text]));
  const original = (id: string) => id ? { text: facts.get(id)!, sourceIds: [id] } : { text: '', sourceIds: [] as string[] };
  const entries = (section: 'experience' | 'projects') => source[section].map(e => ({
    id: e.id, overview: original(e.overviewId), bullets: e.bulletIds.map(original), omitted: [],
  }));
  const draft = { summary: original(source.summaryId), experience: entries('experience'), projects: entries('projects'), skillOrder: source.skillIds, omittedSkills: [] };
  if (validateDraft(source, draft).issues.length) throw new CompositionError('input', 'Source wording cannot fit the existing composition limits. Nothing was sent.');
}

export function exactSourceWording(profile: CVProfile, compiled: Compiled, parsed: NaturalDocument): Compiled {
  const source = compiled.source;
  // Follow the same alternative selection as compilation. Work from parsed,
  // schema-validated suggestions, but use a suggestion only when the exact
  // line and single reference also survived the compiled draft.
  const chosen = chooseAlternativeEntries(source, parsed, parsed.alternativeEntries, NATURAL_SUMMARY_MAX, NATURAL_REFS_MAX).entries;
  const candidate = clone(profile);
  candidate.skills = clone(compiled.candidate.skills);
  const draft = clone(compiled.draft);
  const facts = new Map(source.evidence.map(f => [f.id, f]));
  const original = (id: string) => id ? { text: facts.get(id)!.text, sourceIds: [id] } : { text: '', sourceIds: [] as string[] };
  draft.summary = original(source.summaryId);

  for (const section of ['experience', 'projects'] as const) {
    for (const [index, entry] of source[section].entries()) {
      const native = candidate[section].data[index];
      const old = profile[section].data[index];
      const compiledEntry = draft[section].find(item => item.id === entry.id)!;
      const matches = chosen.filter(item => item.id === entry.id);
      const suggested = !source.locks[section] && matches.length === 1 ? matches[0].bullets : [];
      // Count all appearances, even in unusable multi-reference lines: an ID
      // mentioned twice is ambiguous and never receives suggested priority.
      const counts = new Map<string, number>();
      for (const line of suggested) for (const id of line.sourceIds) counts.set(id, (counts.get(id) ?? 0) + 1);
      const indices = new Map(entry.bulletIds.map(id => [id, Number(id.slice(id.lastIndexOf('_b') + 2)) - 1]));
      const prioritized: number[] = [];
      for (const line of suggested) {
        if (!line.text.trim() || line.sourceIds.length !== 1) continue;
        const id = line.sourceIds[0], nativeIndex = indices.get(id);
        if (nativeIndex === undefined || counts.get(id) !== 1) continue;
        if (!compiledEntry.bullets.some(p => p.text === line.text && p.sourceIds.length === 1 && p.sourceIds[0] === id)) continue;
        prioritized.push(nativeIndex);
      }
      const selected = new Set(prioritized);
      const order = [...prioritized, ...old.bullets.map((_, i) => i).filter(i => !selected.has(i))];
      native.bullets = order.map(i => clone(old.bullets[i]));
      // Draft is the validated, trimmed source projection; the native candidate
      // above retains original whitespace, empty bullets and all bullet metadata.
      const idByIndex = new Map([...indices].map(([id, i]) => [i, id]));
      compiledEntry.overview = original(entry.overviewId);
      compiledEntry.bullets = order.flatMap(i => { const id = idByIndex.get(i); return id ? [original(id)] : []; });
      compiledEntry.omitted = [];
    }
  }
  const check = validateDraft(source, draft);
  if (check.issues.length) throw new CompositionError('contract', 'Exact-source projection could not fit the validated draft limits or source references. Nothing was saved.');
  const summary = original(source.summaryId);
  const summarySegments = summary.text ? [summary] : [];
  const summaryTrace = summary.text ? [{ segmentIndex: 0, sources: [{ sourceId: source.summaryId, kind: facts.get(source.summaryId)!.kind, parent: facts.get(source.summaryId)!.parent }] }] : [];
  return {
    ...compiled, candidate, draft,
    omittedSourceIds: draft.omittedSkills.map(item => item.sourceId),
    summarySegments, summaryTrace, summaryRemovals: [], summaryCapabilityIds: [],
    // Generated prose was discarded; its warnings no longer describe the copy.
    warnings: [
      ...compiled.warnings.filter(w => w.path === 'skillSelections'),
      { path: 'sourceWording', message: 'Original wording and AI-suggested ordering are not factually verified. Review the content and its ordering.' },
    ],
    guardNotes: compiled.guardNotes.filter(n => n.path === 'skillSelections'),
  };
}
