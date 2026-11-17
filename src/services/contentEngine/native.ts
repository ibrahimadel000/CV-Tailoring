import { v4 as uuid } from 'uuid';
import { cvProfileSchema, type CVProfile } from '@/types/schema';
import { TailorError } from '@/services/tailorModel';
import { validateDraft, type Source, type Draft } from './engine';
export type Choices = { summary: boolean; skills: boolean; entries: string[] };
export function defaultChoices(draft: Draft): Choices { return { summary: true, skills: true, entries: [...draft.experience, ...draft.projects].map(e => e.id) }; }
/** Imported leftovers are retained on the source for recovery, but are not resume content. */
function removeImportedDetails(out: CVProfile): void {
  if (!out.customSections) return;
  out.customSections = out.customSections.filter(section => section.title.trim().toLowerCase() !== 'imported details');
}
export function bindDraft(source: CVProfile, facts: Source, draft: Draft): CVProfile {
  const checked = validateDraft(facts, draft);
  if (checked.issues.length) throw new TailorError('invalid', 'The draft does not match the selected source. Nothing was saved.');
  const out: CVProfile = JSON.parse(JSON.stringify(source));
  removeImportedDetails(out);
  out.summary.data = draft.summary.text;
  for (const section of ['experience', 'projects'] as const) {
    if (source[section].isLocked) continue;
    for (const [i, original] of source[section].data.entries()) {
      const entry = draft[section].find(e => e.id === `${section === 'experience' ? 'work' : 'project'}_${i + 1}`)!;
      // Native projects do not have an overview field: retain any overview as a bullet.
      const parts = section === 'projects' && entry.overview.text ? [entry.overview, ...entry.bullets] : entry.bullets;
      const used = new Set<string>();
      out[section].data[i].bullets = parts.map(p => {
        const oldRef = p.sourceIds.length === 1 ? /^((?:work|project)_\d+)_b(\d+)$/.exec(p.sourceIds[0]) : null;
        const old = oldRef && oldRef[1] === entry.id ? original.bullets[Number(oldRef[2]) - 1] : undefined;
        if (old && !used.has(old.id) && old.text === p.text) { used.add(old.id); return { ...old }; }
        return { id: uuid(), text: p.text, isVerified: false };
      });
      if (section === 'experience') out.experience.data[i].description = entry.overview.text;
    }
  }
  if (!source.skills.isLocked) out.skills.data = draft.skillOrder.map(id => {
    const index = facts.skillIds.indexOf(id), fact = facts.evidence.find(f => f.id === id);
    // IDs bind to source positions, never to model-authored names or inferred categories.
    const match = /^skill_(\d+)$/.exec(id), skill = match ? source.skills.data[Number(match[1]) - 1] : undefined;
    if (index < 0 || !fact || !skill) throw new TailorError('invalid', 'Unknown native skill binding. Nothing was saved.');
    return { ...skill };
  });
  cvProfileSchema.parse(out); return out;
}
export function reviewedCopy(source: CVProfile, candidate: CVProfile, draft: Draft, choices: Choices): CVProfile {
  const allowed = new Set([...draft.experience, ...draft.projects].map(e => e.id));
  if (new Set(choices.entries).size !== choices.entries.length || choices.entries.some(id => !allowed.has(id))) throw new TailorError('invalid', 'Invalid review choices. Nothing was saved.');
  const out: CVProfile = JSON.parse(JSON.stringify(source));
  removeImportedDetails(out);
  if (choices.summary && !source.summary.isLocked) out.summary.data = candidate.summary.data;
  if (choices.skills && !source.skills.isLocked) out.skills.data = JSON.parse(JSON.stringify(candidate.skills.data));
  for (const section of ['experience', 'projects'] as const) {
    if (source[section].isLocked) continue;
    for (let i = 0; i < out[section].data.length; i++) if (choices.entries.includes(`${section === 'experience' ? 'work' : 'project'}_${i + 1}`)) Object.assign(out[section].data[i], JSON.parse(JSON.stringify(candidate[section].data[i])));
  }
  cvProfileSchema.parse(out); return out;
}
