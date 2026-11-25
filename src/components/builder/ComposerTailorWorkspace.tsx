import { useEffect, useRef, useState } from 'react';
import { Sparkles, Upload, Loader2, X, Lock, Unlock } from 'lucide-react';
import { useAppStore, type LockableTailorSection } from '@/store/useAppStore';
import type { ImportMetadata } from '@/types/schema';
import { CompositionError } from '@/services/resumeComposer/core';
import { createStoreComposer } from '@/services/resumeComposer/store';
import { requestComposition, COMPOSITION_MODEL, COMPOSITION_MODELS, COMPOSITION_PREVIEW_LABEL, TAILORING_STYLES, type CompositionModel, type TailoringStyle } from '@/services/resumeComposer/request';
import { TailorError } from '@/services/tailorModel';
import { getTailorConnection } from '@/services/tailorConnection';
import { summaryBoundaryNotice } from '@/services/resumeComposer/summaryBoundary';
import { TailorDiffReview } from './TailorDiffReview';
import { JobMatchBreakdown } from './JobMatchBreakdown';
const entryChangeText = {
  empty: 'No entries',
  unchanged: 'Wording and order unchanged',
  reordered: 'Wording unchanged; order changed',
  edited: 'Wording or content changed',
} as const;
const DEFAULT_UI_MODEL: CompositionModel = 'gemini-3.8-flash';
const QUICK_LOCK_SECTIONS: { id: LockableTailorSection; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'experience', label: 'Experience' },
  { id: 'projects', label: 'Projects' },
  { id: 'skills', label: 'Skills' },
];
export function TailorWorkspace({ onCreated, onEditOriginal, onImport, onReviewImport }: { onCreated: (profileId: string, notice: string, reviewNotes: string[]) => void; onEditOriginal: () => void; onImport: () => void; onReviewImport: (data: ImportMetadata) => void }) {
  const profiles = useAppStore(s => s.profiles), activeId = useAppStore(s => s.activeProfileId), setActive = useAppStore(s => s.setActiveProfile), toggleSectionLock = useAppStore(s => s.toggleSectionLock);
  const active = profiles.find(p => p.profileId === activeId);
  const currentSource = active?.baseProfileId ? profiles.find(p => p.profileId === active.baseProfileId) : undefined;
  const [job, setJob] = useState(''), [busy, setBusy] = useState(false), [elapsedSec, setElapsedSec] = useState(0), [message, setMessage] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [model, setModel] = useState<CompositionModel>(DEFAULT_UI_MODEL);
  const selectedModel = useRef<CompositionModel>(DEFAULT_UI_MODEL);
  const [style, setStyle] = useState<TailoringStyle>('balanced');
  const selectedStyle = useRef<TailoringStyle>('balanced');
  const modelLabel = COMPOSITION_MODELS.find(option => option.id === model)!.label;
  const previewLabel = model === COMPOSITION_MODEL ? COMPOSITION_PREVIEW_LABEL : `Single-draft preview · ${modelLabel} · experimental`;
  const runner = useRef<ReturnType<typeof createStoreComposer>>();
  const styledRunner = useRef<ReturnType<typeof createStoreComposer>>();
  const activeRunner = useRef<ReturnType<typeof createStoreComposer>>();
  if (!runner.current) runner.current = createStoreComposer((packet, signal) => requestComposition(packet, signal, selectedModel.current));
  if (!styledRunner.current) styledRunner.current = createStoreComposer((packet, signal) => requestComposition(packet, signal, selectedModel.current, selectedStyle.current));
  const controller = useRef<AbortController>(), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); activeRunner.current?.cancel(); }; }, []);
  useEffect(() => {
    if (!busy) { setElapsedSec(0); return; }
    const started = Date.now();
    const interval = setInterval(() => setElapsedSec(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [busy]);
  const connection = getTailorConnection();
  function cancelTailor() {
    const task = controller.current;
    controller.current = undefined;
    task?.abort();
    activeRunner.current?.cancel();
    if (alive.current) {
      setBusy(false);
      setMessage('Tailoring cancelled. Your original resume is unchanged.');
    }
  }
  const allLocked = Boolean(active && QUICK_LOCK_SECTIONS.every(({ id }) => active[id].isLocked));
  const displayNotes = notes.length ? notes : (active?.compositionReview?.notes ?? []);
  async function tailor() {
    if (controller.current || !active || allLocked) return;
    if (runner.current?.isBusy() || styledRunner.current?.isBusy()) { setMessage('Previous tailoring request is still cancelling. Try again in a moment.'); return; }
    selectedModel.current = model;
    selectedStyle.current = style;
    const currentRunner = style === 'balanced' ? runner.current! : styledRunner.current!;
    activeRunner.current = currentRunner;
    const task = new AbortController(); controller.current = task;
    setBusy(true); setElapsedSec(0); setMessage(''); setNotes([]);
    try {
      const result = await currentRunner.run(job, task.signal);
      if (!alive.current || controller.current !== task || task.signal.aborted) return;
      const notice = summaryBoundaryNotice(result.summaryRemovals.length, result.summarySegments.length);
      const reviewNotes = [...result.warnings.map(w => `${w.path}: ${w.message}`), ...result.normalizations.map(n => n.reason)];
      setNotes(reviewNotes);
      const draft = result.proposalComparison;
      const unchangedDetail = ` The AI proposed ${draft.proposed} work/project bullet lines; ${draft.different} differed from the source before local checks.`;
      setMessage((result.status === 'created' ? 'A new editable copy is open. Your original is unchanged. Check the content before exporting; browser save status is shown above.' : `No meaningful narrative changes were produced, so no duplicate copy was created.${unchangedDetail}`) + (notice ? ` ${notice}` : ''));
      if (result.status === 'created') onCreated(result.profileId, notice, reviewNotes);
    } catch (e) {
      if (!alive.current || controller.current !== task) return;
      if (task.signal.aborted) {
        setMessage('Tailoring cancelled. Your original resume is unchanged.');
      } else {
        setMessage(e instanceof CompositionError || e instanceof TailorError ? e.message : 'Could not complete tailoring. Check your original before trying again.');
      }
    } finally { if (controller.current === task) { controller.current = undefined; if (alive.current) setBusy(false); } }
  }
  return <aside className="tailor-pane" aria-labelledby="tailor-heading" aria-busy={busy}>
    <header className="tailor-heading"><span className="tailor-mark"><Sparkles size={20} /></span><div><h2 id="tailor-heading">CV Tailor</h2><p>A focused resume from your real content.</p></div></header>
    <div className="tailor-scroll" role="region" aria-label="CV tailoring inputs" tabIndex={0}>
      <div className="tailor-feedback" role="note"><strong>{previewLabel}</strong><p>Creates a tailored copy grounded in your real experience. Review every claim before exporting.</p></div>
      {message && <div className="tailor-feedback" role="status"><p>{message}</p></div>}
      {active?.compositionChanges && <details className="tailor-review" open>
        <summary>What changed during tailoring</summary>
        <p>This compares the copy with its source at the time it was made. Later edits are not included.</p>
        <p>Summary: {active.compositionChanges.summary === 'changed' ? 'Wording changed' : 'Unchanged'} · Experience: {entryChangeText[active.compositionChanges.experience]} · Projects: {entryChangeText[active.compositionChanges.projects]}.</p>
        {(active.compositionSnapshot || currentSource) && <TailorDiffReview active={active} source={currentSource} />}
        {active.compositionChanges.proposal && <p>Before local checks, the AI proposed {active.compositionChanges.proposal.proposed} work/project bullet lines; {active.compositionChanges.proposal.different} did not exactly match a source passage in the same entry.</p>}
        <p>Skills: {active.compositionChanges.skills.retained} retained; {active.compositionChanges.skills.excluded.length} not selected for this copy{active.compositionChanges.skills.added ? `; ${active.compositionChanges.skills.added} added` : ''}.</p>
        {active.compositionChanges.skills.reordered && <p>Selected skills were reordered.</p>}
        {active.compositionChanges.skills.regrouped && <p>Some selected skills were moved to different groups.</p>}
        {active.compositionChanges.skills.excluded.length > 0 && <details>
          <summary>Skills not selected for this copy</summary>
          <ul>{active.compositionChanges.skills.excluded.map((skill, i) => <li key={i}>{skill.name}{skill.level ? ` — ${skill.level}` : ''}</li>)}</ul>
          <p>These remain in the source resume.</p>
        </details>}
      </details>}
      <div className="tailor-source"><div className="tailor-source-heading"><label htmlFor="composer-source">Source resume</label><button className="text-button" disabled={busy} onClick={onImport}><Upload size={15} />Import CV</button></div>
        <select id="composer-source" value={activeId ?? ''} disabled={busy} onChange={e => { setActive(e.target.value); setMessage(''); setNotes([]); }}>{profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.profileName}</option>)}</select>
        <p>Uses the currently selected resume, including your edits. Creates a separate copy; your original, identity, dates, design and locked sections stay unchanged.</p>
        <button className="text-button" disabled={busy} onClick={onEditOriginal}>Open source editor</button>
        {active?.importedFrom && <button className="text-button" disabled={busy} onClick={() => onReviewImport(active.importedFrom!)}>Review imported content</button>}
      </div>
      <div className="tailor-job"><label htmlFor="composer-model">AI model</label><select id="composer-model" disabled={busy} value={model} onChange={e => setModel(e.target.value as CompositionModel)}>{COMPOSITION_MODELS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><p>Gemini 3.8 Flash offers top writing quality; Gemini 3.5 Flash-Lite is fastest. Transient 503/504 stalls fail over once to a fast backup Flash model.</p></div>
      <div className="tailor-job"><label htmlFor="composer-style">Tailoring style</label><select id="composer-style" disabled={busy} value={style} onChange={e => setStyle(e.target.value as TailoringStyle)}>{TAILORING_STYLES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><p>Balanced keeps the standard prompt; Concise tightens for 1-page resumes; Impact-focused leads with verified actions and outcomes.</p></div>
      {active && <div className="tailor-locks" role="group" aria-label="Quick section locks"><span className="tailor-locks-label">Lock sections (keep unchanged)</span><div className="tailor-lock-list">{QUICK_LOCK_SECTIONS.map(({ id, label }) => { const locked = active[id].isLocked; return <button key={id} type="button" className={`tailor-lock-chip ${locked ? 'is-locked' : ''}`} aria-pressed={locked} disabled={busy} onClick={() => toggleSectionLock(id)}>{locked ? <Lock size={13} /> : <Unlock size={13} />}{label}</button>; })}</div>{allLocked && <p className="tailor-locks-warning">All four sections are locked. Unlock at least one section to tailor.</p>}</div>}
      <div className="tailor-job"><label htmlFor="composer-job">Job description</label><textarea id="composer-job" dir="auto" value={job} disabled={busy} maxLength={32000} placeholder="Paste the full job description…" onChange={e => setJob(e.target.value)} /><p>{job.length.toLocaleString()} / 32,000 characters. Minimum 40.</p></div>
      {active && (job.trim().length >= 40 || (job.trim().length === 0 && active.targetJob)) && <JobMatchBreakdown profile={active} job={job.trim().length >= 40 ? job : (active.targetJob || '')} />}
      {!!displayNotes.length && <details className="tailor-review"><summary>Content review notes · {displayNotes.length}</summary><p>Review these highlighted notes in the editor before exporting.</p>{displayNotes.map((n, i) => <p key={i}>{n}</p>)}</details>}
    </div>
    <footer className="tailor-footer"><div className={`tailor-connection ${connection.ready ? 'is-ready' : ''}`}><span />{busy ? `Writing your tailored copy… (${elapsedSec}s)` : connection.ready ? previewLabel : 'AI server/setup required'}</div>
      {busy ? <button className="secondary-button" onClick={cancelTailor}><X size={16} />Cancel tailoring</button> : <button className="primary-button" disabled={!connection.ready || !active || allLocked || job.trim().length < 40} onClick={() => void tailor()}><Sparkles size={16} />Tailor CV</button>}
      {busy && <p><Loader2 size={14} className="spin" />Request in progress ({elapsedSec}s). Click Cancel to stop.</p>}
      <p>Tailor CV sends professional resume content and this job to Google. Contact fields, photos and private-note sections are excluded. Review your tailored copy before exporting.</p>
    </footer>
  </aside>;
}
