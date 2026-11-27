import { balanceTailoredTheme } from '../autoLayout';
import { rejectedDiagnostics, type RejectedDiagnostics } from './rejectedDiagnostics';
import { v4 as uuid } from 'uuid';
import type { CVProfile } from '@/types/schema';
import { cvProfileSchema } from '@/types/schema';
import { useAppStore, DEFAULT_DOCUMENT_THEME } from '@/store/useAppStore';
import { TailorError, prepareTailorInput, validateNewCopy } from '@/services/tailorModel';
import { TAILOR_MODEL } from '@/services/tailorRequest';
import { projectSource, numericRiskFlags, type Source, type Draft } from './engine';
import { selectionPacket, editorialDiagnostics, type Selection } from './pipeline';
import { normalizeEditorial, editorialWriterPacket, materializeEditorial, editorialAdvisories } from './editorial';
import type { EditorialPlan } from '@/types/editorial';
import type { ScopeAction } from './source-scope';
import { requestContent } from './request';
import { bindDraft, reviewedCopy, type Choices } from './native';
export type SelectionPreview = { id: string; source: CVProfile; facts: Source; selection: Selection; duplicateCount: number; editorial: EditorialPlan };
export type DraftPreview = SelectionPreview & { draft: Draft; candidate: CVProfile; advisories: string[]; scopeActions: ScopeAction[] };
type Pending = Omit<SelectionPreview, 'editorial'> & { editorial?: EditorialPlan } & { snapshot: string; activeId: string | null; job: string; requestKey: string; output?: DraftPreview };
let pending: Pending | undefined, inFlight = false;
let rejected: RejectedDiagnostics | undefined;
export function readRejectedContent() { return rejected ? JSON.parse(JSON.stringify(rejected)) as RejectedDiagnostics : null; }
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
function assertCurrent(p: Pending) {
  const state = useAppStore.getState();
  if (pending?.id !== p.id || state.activeProfileId !== p.activeId || JSON.stringify(state.profiles.find(x => x.profileId === p.source.profileId)) !== p.snapshot) throw new TailorError('stale', 'The source, active resume or review changed. No copy was saved. Discard and start from the intended source.');
}
function requirePending(id: string) { if (!pending || pending.id !== id) throw new TailorError('stale', 'This review is no longer available. No copy was saved.'); assertCurrent(pending); return pending; }
export function discardContent(id?: string) { if (!id || pending?.id === id) { pending = undefined; rejected = undefined; } }
function invalid(issues: { path: string; message: string }[]) { return new TailorError('invalid', 'Response failed structural/selection checks: ' + issues.slice(0, 4).map(i => `${i.path}: ${i.message}`).join('; ') + '. No automatic retry or resume changes.'); }
export async function chooseContent(sourceId: string, job: string, signal: AbortSignal): Promise<SelectionPreview> {
  if (inFlight || pending) throw new TailorError('busy', 'Finish or discard the current content session first.');
  rejected = undefined;
  const state = useAppStore.getState(), original = state.profiles.find(p => p.profileId === sourceId);
  if (!original) throw new TailorError('source', 'Choose an existing source resume.');
  prepareTailorInput(original, job);
  if (signal.aborted) throw new TailorError('cancelled', 'Cancelled. Nothing was sent.');
  const source: CVProfile = clone(original), facts = projectSource(source), id = uuid();
  const p: Pending = { id, source, facts, snapshot: JSON.stringify(original), activeId: state.activeProfileId, job: job.trim(), requestKey: '', selection: { summaryWorkIds: [], entries: [], skillOrder: [], omittedSkillIds: [], skillGroups: [] }, duplicateCount: 0 };
  pending = p; inFlight = true;
  try {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['editorial-writing-b29', TAILOR_MODEL, source.profileId, p.snapshot, p.job])));
    p.requestKey = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
    assertCurrent(p); if (signal.aborted) throw new TailorError('cancelled', 'Cancelled. Nothing was sent.');
    const raw = await requestContent('selection', selectionPacket({ source: facts, job: p.job }), signal);
    assertCurrent(p); if (signal.aborted) throw new TailorError('cancelled', 'Cancelled. No selection was accepted.');
    const checked = normalizeEditorial(facts, p.job, raw);
    if (!checked.value || checked.issues.length) { rejected = rejectedDiagnostics('selection', raw, checked.issues); throw invalid(checked.issues); }
    p.selection = checked.value.selection; p.editorial = checked.value.editorial; p.duplicateCount = checked.duplicates.length;
    return clone({ id, source, facts, selection: p.selection, editorial: p.editorial, duplicateCount: p.duplicateCount });
  } catch (e) { if (pending?.id === id) pending = undefined; throw e; } finally { inFlight = false; }
}
export async function writeContent(id: string, signal: AbortSignal): Promise<DraftPreview> {
  if (inFlight) throw new TailorError('busy', 'A stage is already running.');
  const p = requirePending(id);
  if (!p.editorial) throw new TailorError('incomplete', 'A valid editorial decision is required before writing.');
  if (p.output) throw new TailorError('busy', 'A completed draft is already available. Review or discard it.');
  rejected = undefined; inFlight = true;
  try {
    const raw = await requestContent('writing', editorialWriterPacket(p.facts, p.selection, p.editorial, p.job), signal);
    assertCurrent(p); if (signal.aborted) throw new TailorError('cancelled', 'Cancelled. No draft was accepted.');
    const checked = materializeEditorial(p.facts, p.selection, p.editorial, raw);
    if (!checked.draft || checked.issues.length) { rejected = rejectedDiagnostics('writing', raw, checked.issues); throw invalid(checked.issues); }
    const candidate = bindDraft(p.source, p.facts, checked.draft);
    const advisories = [...editorialAdvisories(p.editorial), ...numericRiskFlags(p.facts, checked.draft).map(i => `${i.path}: ${i.message}`), ...editorialDiagnostics(p.facts, checked.draft).map(i => `${i.path}: ${i.message}`)];
    p.output = { id: p.id, source: p.source, facts: p.facts, selection: p.selection, editorial: p.editorial, duplicateCount: p.duplicateCount, draft: checked.draft, candidate, advisories, scopeActions: checked.scopeActions ?? [] };
    return clone(p.output);
  } finally { inFlight = false; }
}
export function saveContent(id: string, choices: Choices) {
  if (inFlight) throw new TailorError('busy', 'Wait for the current stage.');
  const p = requirePending(id), result = p.output;
  if (!result) throw new TailorError('incomplete', 'Writing has not completed. No copy can be saved.');
  const source = p.source, next = reviewedCopy(source, result.candidate, result.draft, choices);
  const changes: NonNullable<CVProfile['tailoring']>['changes'] = [];
  if (next.summary.data !== source.summary.data) changes.push({ area: 'summary', before: source.summary.data, after: next.summary.data, origin: 'ai' });
  for (const section of ['experience', 'projects'] as const) for (const [i, entry] of next[section].data.entries()) {
    const original = source[section].data[i], before = JSON.stringify(original), after = JSON.stringify(entry);
    if (before !== after) changes.push({ area: section, entryId: entry.id, before, after, origin: 'ai' });
  }
  if (JSON.stringify(next.skills.data) !== JSON.stringify(source.skills.data)) changes.push({ area: 'skills', before: JSON.stringify(source.skills.data), after: JSON.stringify(next.skills.data), origin: 'ai' });
  if (!changes.length) throw new TailorError('unchanged', 'The accepted content is identical to the source. No redundant copy was saved.');
  next.profileId = uuid(); next.baseProfileId = source.profileId;
  next.profileName = `${source.profileName} — Tailored`.slice(0, 100); next.targetJob = p.job;
  next.version = source.version + 1; next.lastConfirmed = ''; delete next.matchScore;
  next.documentTheme = balanceTailoredTheme(source, next, clone(source.documentTheme ?? DEFAULT_DOCUMENT_THEME));
  const kept = new Set(choices.entries);
  const omitted = [...result.draft.experience, ...result.draft.projects].filter(e => kept.has(e.id)).flatMap(e => e.omitted.map(x => x.sourceId));
  if (choices.skills) omitted.push(...result.draft.omittedSkills.map(x => x.sourceId));
  const bindings = p.facts.evidence.flatMap(f => {
    const skill = /^skill_(\d+)$/.exec(f.id); if (skill) return [{ sourceId: f.id, skillId: source.skills.data[Number(skill[1]) - 1].id }];
    const entry = /^(work|project)_(\d+)(?:_b(\d+)|_overview)?$/.exec(f.id);
    if (!entry) return [{ sourceId: f.id }];
    const original = (entry[1] === 'work' ? source.experience : source.projects).data[Number(entry[2]) - 1];
    return [{ sourceId: f.id, entryId: original.id, ...(entry[3] ? { bulletId: original.bullets[Number(entry[3]) - 1].id } : {}) }];
  });
  next.tailoring = { sourceProfileId: source.profileId, requestKey: p.requestKey, jobTitle: 'Tailored resume', company: '', createdAt: new Date().toISOString(), model: TAILOR_MODEL,
    warnings: ['Source references and structural checks are not independent factual verification. Review wording and source limits before exporting.', ...result.advisories], missingRequirements: [], changes,
    ...(choices.summary ? { summaryEvidence: result.draft.summary.sourceIds.map(id => { const f = p.facts.evidence.find(x => x.id === id)!; return { id, label: f.kind, text: f.text }; }) } : {}),
    contentEngine: { version: 'editorial-writing-b29', editorial: result.editorial, reviewedAt: new Date().toISOString(), omittedSourceIds: omitted, bindings, scopeActions: result.scopeActions.filter(a => [...kept].some(entry => a.path.includes(`.${entry}.`))).map(({ path, sourceId, text }) => ({ path, sourceId, text })) },
  };
  validateNewCopy(next); cvProfileSchema.parse(next);
  useAppStore.setState(state => {
    assertCurrent(p);
    if (state.profiles.some(x => x.profileId === next.profileId)) throw new TailorError('stale', 'This copy was already saved.');
    return { profiles: [...state.profiles, next], activeProfileId: next.profileId, documentTheme: clone(next.documentTheme!) };
  });
  pending = undefined; rejected = undefined; return { profileId: next.profileId };
}
