/**
 * Graceful, deterministic normalization of one AI document before native compilation.
 * Preserves hard truthfulness guards (unlisted tools/tech, unverified numbers, scope inversions,
 * verbatim summary copies, cross-entry references) while avoiding false-positive reverts on
 * conceptual/process skills (e.g. Business Operations, Workflow Automation, Project Management).
 */
import type { Source } from '../contentEngine/engine';
import { isEntryMetadata } from './references';
import { buildTermIndex, analyzeTerms, unsupportedNumbers, copiedPassage, type Term } from './terms';
import { containsSkillName } from './summaryBoundary';
import { scopeRisk } from './scopeRisk';

type Paragraph = { text: string; sourceIds: string[] };
type Entry = { id: string; overview: Paragraph; bullets: Paragraph[] };
export type GuardInput = {
  summarySegments: Paragraph[];
  entries: Entry[];
  skillSelections: { id: string; category: 'Technical' | 'Tools' | 'Soft' | 'Languages' }[];
  summaryCapabilityIds?: string[];
};
export type GuardNote = { path: string; message: string; kind: 'restored' | 'removed' | 'ignored' | 'review' };
const empty = (): Paragraph => ({ text: '', sourceIds: [] });
const unique = <T>(values: readonly T[]) => [...new Set(values)];
const list = (terms: readonly string[]) => terms.slice(0, 3).map(t => `“${t}”`).join(', ');

// Conceptual/process skills that represent general work methods rather than concrete software tools;
// allow natural phrasing of these in summaries/bullets without triggering literal skill-collision reverts.
const CONCEPTUAL_SKILL = /^(?:business operations|workflow automation|project management|strategic planning|technical documentation|system analysis|cross[-\s]?functional collaboration|process improvement|agile\s*\/\s*scrum|stakeholder management|problem solving)$/i;

export function guardNaturalDocument(source: Source, doc: GuardInput, summaryMax: number, refsMax: number) {
  const notes: GuardNote[] = [];
  const facts = new Map(source.evidence.map(f => [f.id, f]));
  const skillNames = source.evidence
    .filter(f => f.kind === 'skill')
    .map(f => f.text.split(' — ')[0])
    .filter(name => !CONCEPTUAL_SKILL.test(name.trim()));
  const index: Term[] = buildTermIndex(skillNames);
  const narrative = source.evidence.filter(f => f.kind === 'achievement' || f.kind === 'role');

  let summarySegments: Paragraph[] = [];
  const summarySegmentIndices: number[] = [];
  if (source.locks.summary) {
    if (doc.summarySegments.length) notes.push({ path: 'summary', kind: 'ignored', message: 'Your summary is locked, so the AI summary was ignored.' });
  } else {
    let used = 0;
    const union = new Set<string>();
    for (const [i, segment] of doc.summarySegments.entries()) {
      const text = segment.text.trim(), ids = unique(segment.sourceIds);
      if (!text) continue;
      if (!ids.length || ids.some(id => !facts.has(id))) {
        notes.push({ path: `summarySegments.${i}`, kind: 'removed', message: 'Removed a summary sentence that cited content not found in your CV.' });
        continue;
      }
      const cited = ids.map(id => facts.get(id)!);
      if (copiedPassage(text, narrative)) {
        notes.push({ path: `summarySegments.${i}`, kind: 'removed', message: 'Removed a summary sentence that repeats one experience/project passage instead of introducing your background.' });
        continue;
      }
      const support = cited.map(f => f.text);
      const citedNarrative = cited.filter(f => f.kind !== 'skill');
      const boundaryWillRemove = !citedNarrative.length || skillNames.some(name => containsSkillName(text, name)
        && !citedNarrative.some(f => containsSkillName(f.text, name)));
      const signals = analyzeTerms(text, support, index);
      const terms = signals.unsupported.map(t => t.label), numbers = unsupportedNumbers(text, support);
      if (!boundaryWillRemove && (terms.length || numbers.length)) {
        notes.push({ path: `summarySegments.${i}`, kind: 'removed', message: `Removed a generated summary passage because it added ${list([...terms, ...numbers])}, which its cited CV content does not mention.` });
        continue;
      }
      const risks = scopeRisk(text, cited.filter(f => f.kind !== 'skill' && f.kind !== 'headline' && !isEntryMetadata(f.id)).map(f => f.text));
      if (!boundaryWillRemove && risks.length) {
        notes.push({ path: `summarySegments.${i}`, kind: 'removed', message: `Removed a generated summary passage because ${risks.join('; ')}. This is a limited local check, not factual verification.` });
        continue;
      }
      const cost = (used ? 1 : 0) + text.length;
      if (used + cost > summaryMax) {
        notes.push({ path: `summarySegments.${i}`, kind: 'removed', message: 'Removed an extra summary sentence to keep the summary within its length limit.' });
        continue;
      }
      const added = ids.filter(id => !union.has(id));
      if (union.size + added.length > refsMax) {
        notes.push({ path: `summarySegments.${i}`, kind: 'removed', message: 'Removed a summary sentence to keep references within the traceability limit.' });
        continue;
      }
      used += cost; for (const id of added) union.add(id);
      if (!boundaryWillRemove && signals.splitPhrases.length) notes.push({ path: `summarySegments.${i}`, kind: 'review', message: `Review ${list(signals.splitPhrases)}. The cited source uses a different word order; this literal match does not verify the claim or its scope.` });
      summarySegments.push({ text, sourceIds: ids });
      summarySegmentIndices.push(i);
    }
  }
  if (doc.summaryCapabilityIds?.length) notes.push({ path: 'summaryCapabilityIds', kind: 'ignored', message: 'Ignored a retired automatic skills list; skills stay in the Skills section.' });

  const unlocked = [
    ...(source.locks.experience ? [] : source.experience),
    ...(source.locks.projects ? [] : source.projects),
  ];
  const written = new Map<string, Entry>();
  for (const entry of doc.entries) {
    if (!unlocked.some(u => u.id === entry.id)) { notes.push({ path: `entries.${entry.id}`, kind: 'ignored', message: 'Ignored AI content for an entry that is locked or not in your CV.' }); continue; }
    if (written.has(entry.id)) { notes.push({ path: `entries.${entry.id}`, kind: 'ignored', message: 'Ignored a duplicate AI version of this entry; the first was kept.' }); continue; }
    written.set(entry.id, entry);
  }
  const entries: Entry[] = unlocked.map(u => {
    const label = [u.title, u.organization].filter(Boolean).join(' · ') || u.id;
    const original = (id: string): Paragraph => ({ text: facts.get(id)!.text, sourceIds: [id] });
    const originalEntry: Entry = { id: u.id, overview: u.overviewId ? original(u.overviewId) : empty(), bullets: u.bulletIds.map(original) };
    const w = written.get(u.id);
    if (!w) { notes.push({ path: `entries.${u.id}`, kind: 'restored', message: `${label}: kept your original wording because the AI response skipped this entry.` }); return originalEntry; }
    const own = new Set([u.overviewId, ...u.bulletIds].filter(Boolean));
    let ambiguousLine = false;
    const check = (p: Paragraph, where: string, allowMetadata = false): Paragraph[] | null => {
      const allIds = unique(p.sourceIds);
      const metadata = allIds.filter(isEntryMetadata);
      const ids = allIds.filter(id => !isEntryMetadata(id));
      if (metadata.some(id => !allowMetadata || facts.get(id)?.parent !== u.id)) {
        const ownIds = ids.filter(id => own.has(id));
        if (!ownIds.length) ambiguousLine = true;
        notes.push({ path: where, kind: 'restored', message: `${label}: the AI used an identity reference that cannot support this line; original wording was kept.` });
        return ownIds.map(original);
      }
      if (!ids.length) { ambiguousLine = true; notes.push({ path: where, kind: 'restored', message: `${label}: the AI line had no usable entry evidence; original entry wording was kept.` }); return []; }
      if (ids.some(id => !own.has(id))) {
        const ownIds = ids.filter(id => own.has(id));
        if (!ownIds.length) { ambiguousLine = true; notes.push({ path: where, kind: 'restored', message: `${label}: the AI line was not based on this entry; original entry wording was kept.` }); return []; }
        notes.push({ path: where, kind: 'restored', message: `${label}: kept your original wording because the AI mixed in content from elsewhere.` });
        return ownIds.map(original);
      }
      const support = allIds.map(id => facts.get(id)!.text);
      const signals = analyzeTerms(p.text, support, index);
      const terms = signals.unsupported.map(t => t.label), numbers = unsupportedNumbers(p.text, support);
      if (terms.length || numbers.length) {
        notes.push({ path: where, kind: 'restored', message: `${label}: kept your original wording because the rewrite added ${list([...terms, ...numbers])}, which this part of your CV does not mention.` });
        return ids.map(original);
      }
      const risks = scopeRisk(p.text, ids.map(id => facts.get(id)!.text));
      if (risks.length) {
        notes.push({ path: where, kind: 'restored', message: `${label}: kept your original wording because ${risks.join('; ')}. This is a limited local check, not factual verification.` });
        return ids.map(original);
      }
      if (signals.splitPhrases.length) notes.push({ path: where, kind: 'review', message: `${label}: review ${list(signals.splitPhrases)}. The cited source uses a different word order; this literal match does not verify the claim or its scope.` });
      return null;
    };
    let overview = empty();
    if (u.overviewId && w.overview.text.trim()) {
      const text = w.overview.text.trim();
      const result = check({ text, sourceIds: w.overview.sourceIds }, `entries.${u.id}.overview`, true);
      const repeatsOwnBullet = result === null && text !== facts.get(u.overviewId)!.text
        && copiedPassage(text, u.bulletIds.map(id => facts.get(id)!).filter(Boolean));
      if (repeatsOwnBullet) {
        notes.push({ path: `entries.${u.id}.overview`, kind: 'restored', message: `${label}: kept your original overview because the AI version repeated one of this entry's own contributions.` });
        overview = original(u.overviewId);
      } else overview = result === null ? { text, sourceIds: unique(w.overview.sourceIds) } : original(u.overviewId);
    } else if (!u.overviewId && (w.overview.text.trim() || w.overview.sourceIds.length)) {
      notes.push({ path: `entries.${u.id}.overview`, kind: 'ignored', message: `${label}: ignored a new overview paragraph; contributions stay in bullets.` });
    }
    const bullets: Paragraph[] = [];
    const seen = new Set<string>();
    const accepted: Paragraph[] = [];
    const restoredIds = new Set<string>();
    const push = (p: Paragraph) => { const key = p.text + ' ' + p.sourceIds.join(','); if (!seen.has(key)) { seen.add(key); bullets.push(p); } };
    for (const [j, b] of w.bullets.entries()) {
      const text = b.text.trim();
      if (!text) {
        ambiguousLine = true;
        notes.push({ path: `entries.${u.id}.bullets.${j}`, kind: 'removed', message: b.sourceIds.length
          ? `${label}: removed an empty AI line that claimed source coverage.`
          : `${label}: removed an empty AI line.` });
        continue;
      }
      const result = check({ text, sourceIds: b.sourceIds }, `entries.${u.id}.bullets.${j}`);
      if (result === null) {
        const paragraph = { text, sourceIds: unique(b.sourceIds).filter(id => !isEntryMetadata(id)) };
        accepted.push(paragraph);
        push(paragraph);
      } else for (const r of result) if (!(overview.text && r.sourceIds[0] === u.overviewId)) {
        restoredIds.add(r.sourceIds[0]);
        push(r);
      }
    }
    if (ambiguousLine) {
      notes.push({ path: `entries.${u.id}`, kind: 'restored', message: `${label}: kept the complete original entry because a rejected line could not be matched safely to its source.` });
      return originalEntry;
    }
    const originalText = (id: string) => facts.get(id)?.text;
    const changed = (p: Paragraph) => p.sourceIds.length !== 1 || p.text !== originalText(p.sourceIds[0]);
    let overlap = false, expanded = true;
    while (expanded) {
      expanded = false;
      for (const p of accepted) if (changed(p) && p.sourceIds.some(id => restoredIds.has(id))) {
        overlap = true;
        for (const id of p.sourceIds) if (!restoredIds.has(id)) { restoredIds.add(id); expanded = true; }
      }
    }
    if (overlap) {
      const rebuilt: Paragraph[] = [], emitted = new Set<string>();
      const sourceOrder = [u.overviewId, ...u.bulletIds].filter((id): id is string => !!id);
      for (const p of bullets) {
        if (!p.sourceIds.some(id => restoredIds.has(id))) { rebuilt.push(p); continue; }
        for (const id of sourceOrder) if (p.sourceIds.includes(id) && restoredIds.has(id) && !emitted.has(id)) {
          emitted.add(id);
          if (!(overview.text && id === u.overviewId)) rebuilt.push(original(id));
        }
      }
      bullets.splice(0, bullets.length, ...rebuilt);
      notes.push({ path: `entries.${u.id}`, kind: 'restored', message: `${label}: kept original wording for overlapping source passages to avoid repeating a rejected rewrite; independent edits were retained.` });
    }
    if (!bullets.length && !overview.text && own.size) {
      notes.push({ path: `entries.${u.id}`, kind: 'restored', message: `${label}: kept your original wording because the AI removed every contribution.` });
      return originalEntry;
    }
    return { id: u.id, overview, bullets };
  });

  let skillSelections = doc.skillSelections;
  if (source.locks.skills) {
    if (skillSelections.length) notes.push({ path: 'skillSelections', kind: 'ignored', message: 'Your skills are locked, so the AI skill selection was ignored.' });
    skillSelections = [];
  } else {
    const seen = new Set<string>();
    skillSelections = skillSelections.filter(s => {
      if (!source.skillIds.includes(s.id)) { notes.push({ path: 'skillSelections', kind: 'ignored', message: 'Ignored a skill that is not in your CV.' }); return false; }
      if (seen.has(s.id)) { notes.push({ path: 'skillSelections', kind: 'ignored', message: 'Ignored a repeated selection of the same skill.' }); return false; }
      seen.add(s.id); return true;
    });
  }
  return { doc: { summarySegments, entries, skillSelections, summaryCapabilityIds: [] as string[] }, notes, summarySegmentIndices };
}
