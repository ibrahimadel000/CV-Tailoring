import { useEffect, useRef, useState } from 'react';
import { Sparkles, Upload, Loader2, X, Lock, Unlock, Download, SlidersHorizontal } from 'lucide-react';
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
import { formatReviewNote } from './reviewCopy';
const entryChangeText = {
  empty: 'No entries',
  unchanged: 'Wording and order unchanged',
  reordered: 'Wording unchanged; order changed',
  edited: 'Wording or content changed',
} as const;
const DEFAULT_UI_MODEL: CompositionModel = COMPOSITION_MODEL;
const QUICK_LOCK_SECTIONS: { id: LockableTailorSection; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'experience', label: 'Experience' },
  { id: 'projects', label: 'Projects' },
  { id: 'skills', label: 'Skills' },
];
export function TailorWorkspace({ onCreated, onEditOriginal, onImport, onReviewImport, onExport, onJumpToSection }: { onCreated: (profileId: string, notice: string, reviewNotes: string[]) => void; onExport?: () => void; onJumpToSection?: (section: 'experience' | 'skills') => void; onEditOriginal: () => void; onImport: () => void; onReviewImport: (data: ImportMetadata) => void }) {
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
  const lockedCount = active ? QUICK_LOCK_SECTIONS.filter(({ id }) => active[id].isLocked).length : 0;
  const styleLabel = TAILORING_STYLES.find(o => o.id === style)?.label ?? 'Balanced';
  const optionsSummary = [
    style !== 'balanced' ? styleLabel : '',
    lockedCount > 0 ? `${lockedCount} locked` : '',
    model !== COMPOSITION_MODEL ? modelLabel : '',
  ].filter(Boolean).join(' · ');

  return <aside className="tailor-pane" aria-labelledby="tailor-heading" aria-busy={busy}>
    <header className="tailor-heading"><span className="tailor-mark"><Sparkles size={20} /></span><div><h2 id="tailor-heading">CV Tailor</h2><p>Creates a tailored copy grounded in your real experience.</p></div></header>
    <div className="tailor-scroll" role="region" aria-label="CV tailoring inputs" tabIndex={0}>
      {message && <div className="tailor-feedback" role="status"><p>{message}</p></div>}

      <div className="tailor-source">
        <div className="tailor-source-heading">
          <label htmlFor="composer-source">Resume</label>
          <button type="button" className="text-button" disabled={busy} onClick={onImport}><Upload size={14} />Import CV</button>
        </div>
        <select id="composer-source" value={activeId ?? ''} disabled={busy} onChange={e => { setActive(e.target.value); setMessage(''); setNotes([]); }}>{profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.profileName}</option>)}</select>
        {active?.importedFrom && <button type="button" className="text-button" disabled={busy} onClick={() => onReviewImport(active.importedFrom!)}>Review imported content</button>}
      </div>

      <div className="tailor-job">
        <label htmlFor="composer-job">Job description</label>
        <textarea id="composer-job" dir="auto" value={job} disabled={busy} maxLength={32000} placeholder="Paste the job description here…" onChange={e => setJob(e.target.value)} />
        <p>{job.trim().length < 40 ? `Paste at least 40 characters (${job.trim().length}/40)` : `${job.length.toLocaleString()} characters`}</p>
      </div>

      <details className="tailor-review">
        <summary><SlidersHorizontal size={13} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 5 }} />Options{optionsSummary ? ` · ${optionsSummary}` : ''}</summary>
        <div className="tailor-job" style={{ marginTop: 10 }}>
          <label htmlFor="composer-style">Tailoring style</label>
          <select id="composer-style" disabled={busy} value={style} onChange={e => setStyle(e.target.value as TailoringStyle)}>{TAILORING_STYLES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
        </div>
        {active && <div className="tailor-locks" role="group" aria-label="Quick section locks" style={{ marginTop: 10 }}><span className="tailor-locks-label">Keep unchanged</span><div className="tailor-lock-list">{QUICK_LOCK_SECTIONS.map(({ id, label }) => { const locked = active[id].isLocked; return <button key={id} type="button" className={`tailor-lock-chip ${locked ? 'is-locked' : ''}`} aria-pressed={locked} disabled={busy} onClick={() => toggleSectionLock(id)}>{locked ? <Lock size={13} /> : <Unlock size={13} />}{label}</button>; })}</div>{allLocked && <p className="tailor-locks-warning">Unlock at least one section to tailor.</p>}</div>}
        <div className="tailor-job" style={{ marginTop: 10 }}>
          <label htmlFor="composer-model">AI model</label>
          <select id="composer-model" disabled={busy} value={model} onChange={e => setModel(e.target.value as CompositionModel)}>{COMPOSITION_MODELS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
        </div>
        <div style={{ marginTop: 8 }}>
          <button type="button" className="text-button" disabled={busy} onClick={onEditOriginal}>Open source editor</button>
        </div>
      </details>

      {active?.compositionChanges && <details className="tailor-review" open>
        <summary>What changed</summary>
        <p>Summary: {active.compositionChanges.summary === 'changed' ? 'Tailored' : 'Unchanged'} · Experience: {entryChangeText[active.compositionChanges.experience]} · Skills: {active.compositionChanges.skills.retained} focused.</p>
        {(active.compositionSnapshot || currentSource) && <TailorDiffReview active={active} source={currentSource} />}
        {active.compositionChanges.skills.excluded.length > 0 && <details>
          <summary>Excluded skills ({active.compositionChanges.skills.excluded.length})</summary>
          <ul>{active.compositionChanges.skills.excluded.map((skill, i) => <li key={i}>{skill.name}{skill.level ? ` — ${skill.level}` : ''}</li>)}</ul>
        </details>}
        {onExport && <div style={{ marginTop: 10 }}><button type="button" className="primary-button" onClick={onExport}><Download size={15} />Export PDF / Word (.docx)</button></div>}
      </details>}

      {active && (job.trim().length >= 40 || (job.trim().length === 0 && active.targetJob)) && <JobMatchBreakdown profile={active} job={job.trim().length >= 40 ? job : (active.targetJob || '')} baseline={currentSource} onJumpToSection={onJumpToSection} />}

      {!!displayNotes.length && <details className="tailor-review"><summary>Review notes · {displayNotes.length}</summary>{displayNotes.map((n, i) => <p key={i}>{formatReviewNote(n, active)}</p>)}</details>}
    </div>
    <footer className="tailor-footer">
      <div className={`tailor-connection ${connection.ready ? 'is-ready' : ''}`} title={previewLabel}><span />{busy ? `Tailoring your CV… (${elapsedSec}s)` : connection.ready ? 'AI ready' : 'AI setup required'}</div>
      {busy ? <button className="secondary-button" onClick={cancelTailor}><X size={16} />Cancel tailoring</button> : <button className="primary-button" disabled={!connection.ready || !active || allLocked || job.trim().length < 40} onClick={() => void tailor()}><Sparkles size={16} />Tailor CV</button>}
      {busy && <p><Loader2 size={14} className="spin" />Tailoring in progress ({elapsedSec}s)…</p>}
      <p>Your original CV stays untouched; contact details and photos are never sent to AI.</p>
    </footer>
  </aside>;
}
