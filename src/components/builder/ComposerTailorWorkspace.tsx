import { useEffect, useRef, useState } from 'react';
import { Sparkles, Upload, Loader2, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { compositionSnapshotSchema, type ImportMetadata } from '@/types/schema';
import { CompositionError } from '@/services/resumeComposer/core';
import { createStoreComposer } from '@/services/resumeComposer/store';
import { requestComposition, liveCompositionCandidates, COMPOSITION_MODEL, COMPOSITION_MODELS, COMPOSITION_PREVIEW_LABEL, TRANSIENT_HTTP_STATUSES, type CompositionModel } from '@/services/resumeComposer/request';
import { TailorError } from '@/services/tailorModel';
import { getTailorConnection, readLatestTailorUsage, type TailorUsageRecord } from '@/services/tailorRequest';
import { summaryBoundaryNotice } from '@/services/resumeComposer/summaryBoundary';
import { CurrentEntryComparison } from './CurrentEntryComparison';
import { HistoricalComparison } from './HistoricalComparison';
import { plainText } from './resumeModel';
const entryChangeText = {
  empty: 'No entries',
  unchanged: 'Wording and order unchanged',
  reordered: 'Wording unchanged; order changed',
  edited: 'Wording or content changed',
} as const;
export function TailorWorkspace({ onCreated, onEditOriginal, onImport, onReviewImport, reviewComparisonRequest, summaryComparisonRequest }: { onCreated: (profileId: string, notice: string, reviewNotes: string[]) => void; onEditOriginal: () => void; onImport: () => void; onReviewImport: (data: ImportMetadata) => void; reviewComparisonRequest: number; summaryComparisonRequest: number }) {
  const profiles = useAppStore(s => s.profiles), activeId = useAppStore(s => s.activeProfileId), setActive = useAppStore(s => s.setActiveProfile);
  const active = profiles.find(p => p.profileId === activeId);
  const currentSource = active?.baseProfileId ? profiles.find(p => p.profileId === active.baseProfileId) : undefined;
  const hasCurrentSource = !!currentSource;
  const parsedSnapshot = compositionSnapshotSchema.safeParse(active?.compositionSnapshot);
  const historicalSnapshot = parsedSnapshot.success ? parsedSnapshot.data : undefined;
  const hasStoredSnapshot = active?.compositionSnapshot !== undefined;
  const missingSourceSkills = currentSource && active ? currentSource.skills.data.filter(skill => !active.skills.data.some(current => current.id === skill.id)) : [];
  const restoreSourceSkill = (skillId: string) => {
    useAppStore.setState(state => {
      const target = state.profiles.find(p => p.profileId === activeId);
      const source = target?.baseProfileId ? state.profiles.find(p => p.profileId === target.baseProfileId) : undefined;
      const skill = source?.skills.data.find(item => item.id === skillId);
      if (state.activeProfileId !== activeId || !target || target.skills.isLocked || !skill || target.skills.data.some(item => item.id === skillId)) return {};
      return { profiles: state.profiles.map(p => p.profileId === target.profileId ? { ...p, skills: { ...p.skills, data: [...p.skills.data, { ...skill }] } } : p) };
    });
  };
  const [job, setJob] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [keepSourceWording, setKeepSourceWording] = useState(false);
  const [saveComparison, setSaveComparison] = useState(true);
  const [allowSourceReorder, setAllowSourceReorder] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [usage, setUsage] = useState<TailorUsageRecord | null>(null);
  const [model, setModel] = useState<CompositionModel>(COMPOSITION_MODEL);
  const selectedModel = useRef<CompositionModel>(COMPOSITION_MODEL);
  const modelLabel = COMPOSITION_MODELS.find(option => option.id === model)!.label;
  const liveModels = liveCompositionCandidates(model).map(id => COMPOSITION_MODELS.find(option => option.id === id)!.label);
  const previewLabel = model === COMPOSITION_MODEL ? COMPOSITION_PREVIEW_LABEL : `Single-draft preview · ${modelLabel} · experimental`;
  const runner = useRef<ReturnType<typeof createStoreComposer>>();
  if (!runner.current) runner.current = createStoreComposer((packet, signal) => requestComposition(packet, signal, selectedModel.current));
  const controller = useRef<AbortController>(), alive = useRef(true);
  const changeDetails = useRef<HTMLDetailsElement>(null), comparisonDetails = useRef<HTMLDetailsElement>(null);
  const comparisonSummary = useRef<HTMLElement>(null);
  const summaryDetails = useRef<HTMLDetailsElement>(null), summaryHeading = useRef<HTMLElement>(null);
  const historicalDetails = useRef<HTMLDetailsElement>(null), historicalHeading = useRef<HTMLElement>(null);
  const syncComparison = () => setComparing(!!(changeDetails.current?.open && (comparisonDetails.current?.open || summaryDetails.current?.open || historicalDetails.current?.open)));
  useEffect(() => { syncComparison(); }, [activeId, hasCurrentSource]);
  useEffect(() => {
    if (!reviewComparisonRequest || !changeDetails.current) return;
    if (!hasCurrentSource && historicalDetails.current) {
      changeDetails.current.open = true; historicalDetails.current.open = true; setComparing(true);
      const frame = requestAnimationFrame(() => { historicalHeading.current?.scrollIntoView({ block: 'start' }); historicalHeading.current?.focus({ preventScroll: true }); });
      return () => cancelAnimationFrame(frame);
    }
    if (!comparisonDetails.current) return;
    changeDetails.current.open = true;
    if (historicalDetails.current) historicalDetails.current.open = false;
    if (summaryDetails.current) summaryDetails.current.open = false;
    comparisonDetails.current.open = true;
    setComparing(true);
    const frame = requestAnimationFrame(() => {
      comparisonSummary.current?.scrollIntoView({ block: 'start' });
      comparisonSummary.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [reviewComparisonRequest]);
  useEffect(() => {
    if (!summaryComparisonRequest || !changeDetails.current) return;
    if (!hasCurrentSource && historicalDetails.current) {
      changeDetails.current.open = true; historicalDetails.current.open = true; setComparing(true);
      const frame = requestAnimationFrame(() => { historicalHeading.current?.scrollIntoView({ block: 'start' }); historicalHeading.current?.focus({ preventScroll: true }); });
      return () => cancelAnimationFrame(frame);
    }
    if (!summaryDetails.current) return;
    changeDetails.current.open = true;
    if (historicalDetails.current) historicalDetails.current.open = false;
    if (comparisonDetails.current) comparisonDetails.current.open = false;
    summaryDetails.current.open = true;
    setComparing(true);
    const frame = requestAnimationFrame(() => {
      summaryHeading.current?.scrollIntoView({ block: 'start' });
      summaryHeading.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [summaryComparisonRequest]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); runner.current?.cancel(); }; }, []);
  const connection = getTailorConnection();
  const stopMessage = /^(Request timed out\.|Cancelled\.|Composition cancelled;)/.test(message);
  async function tailor() {
    if (controller.current || !active) return;
    selectedModel.current = model;
    const task = new AbortController(); controller.current = task;
    const previousUsageId = readLatestTailorUsage()?.id;
    setBusy(true); setMessage(''); setNotes([]); setUsage(null);
    try {
      const result = await runner.current!.run(job, task.signal, { exactSourceWording: keepSourceWording, allowSourceReorder, saveComparison });
      if (!alive.current) return;
      const notice = summaryBoundaryNotice(result.summaryRemovals.length, result.summarySegments.length);
      const reviewNotes = [...result.warnings.map(w => `${w.path}: ${w.message}`), ...result.normalizations.map(n => n.reason)];
      setNotes(reviewNotes);
      const draft = result.proposalComparison;
      const unchangedDetail = ` The AI proposed ${draft.proposed} work/project bullet lines; ${draft.different} did not exactly match a source passage in the same entry before local checks. This is not a quality or accuracy assessment.`;
      setMessage((result.status === 'created' ? (keepSourceWording ? 'A new editable copy is open with your original summary and work/project wording. Review the order and selected skills; your original is unchanged. Browser save status is shown above.' : 'A new editable copy is open. Your original is unchanged. Check the content before exporting; browser save status is shown above.') : keepSourceWording ? 'The source wording, order and skills were unchanged. No duplicate copy was created.' : `The content was unchanged. No duplicate copy was created.${unchangedDetail}`) + (result.status === 'created' && result.snapshotStatus === 'too_large' ? ' The generation text comparison was too large to retain; the copy has no saved comparison. Review against the source.' : result.status === 'created' && result.snapshotStatus === 'not_saved' ? ' No generation text comparison was saved, as selected.' : result.status === 'created' && result.snapshotStatus === 'sensitive_text' ? ' No generation text comparison was saved because a link or contact was detected in professional text. Review against the source.' : '') + (notice ? ` ${notice}` : ''));
      if (result.status === 'created') onCreated(result.profileId, notice, reviewNotes);
    } catch (e) {
      if (alive.current) setMessage(e instanceof CompositionError || e instanceof TailorError ? e.message : 'Could not complete tailoring. Check your original before trying again.');
    } finally { if (controller.current === task) { controller.current = undefined; if (alive.current) { const latest = readLatestTailorUsage(); setUsage(latest && latest.id !== previousUsageId ? latest : null); setBusy(false); } } }
  }
  const historyControls = <>
        {historicalSnapshot ? <details ref={historicalDetails} onToggle={syncComparison}>
          <summary ref={historicalHeading}>Compare at generation (summary, experience and projects)</summary>
          <p>On smaller screens, close this comparison to return to the tailoring controls. Cancellation remains available during a request.</p>
          <HistoricalComparison snapshot={historicalSnapshot} />
          <button type="button" className="text-button" onClick={() => { if (historicalDetails.current) historicalDetails.current.open = false; syncComparison(); historicalHeading.current?.focus({ preventScroll: true }); historicalHeading.current?.scrollIntoView({ block: 'start' }); }}>Close generation comparison</button>
        </details> : <p role="status">{hasStoredSnapshot ? 'This saved comparison is unsupported or damaged and cannot be displayed. It is preserved unchanged unless you remove it.' : active?.compositionSnapshotStatus === 'sensitive_text' ? 'The generation comparison was not saved because a link or contact was detected in professional text. No text was truncated; review against the source.' : active?.compositionSnapshotStatus === 'too_large' ? 'The generation text comparison exceeded the local size limit and was not saved. Nothing was truncated; review against the source.' : active?.compositionSnapshotStatus === 'removed' ? 'The saved generation text comparison was removed from this copy.' : active?.compositionSnapshotStatus === 'not_saved' ? 'No generation text comparison was saved, as selected.' : 'No generation-time text comparison was recorded for this copy.'}</p>}
        {hasStoredSnapshot && <details>
          <summary>Remove saved generation text comparison</summary>
          <p>This removes the saved source and generated text snapshot from this copy, not the resume itself. Other change counts, excluded skill names and review notes remain. Delete the copy to remove its remaining local metadata. Check browser save status after removal.</p>
          <p><strong>Before removing:</strong> save or copy unsaved edits in other tabs. Updated tabs block conflicting saves but may not notice a change until saving. Older versions write a separate legacy copy and their changes are not synced here. The legacy copy remains and may contain this comparison. Removing it here is not global secure erasure; other copies and backups may retain it.</p>
          <button type="button" className="text-button" disabled={busy} onClick={() => {
            useAppStore.setState(state => {
              if (state.activeProfileId !== activeId) return state;
              return { profiles: state.profiles.map(p => {
                if (p.profileId !== activeId || p.compositionSnapshot === undefined) return p;
                const next = { ...p, compositionSnapshotStatus: 'removed' as const }; delete next.compositionSnapshot; return next;
              }) };
            });
            if (historicalDetails.current) historicalDetails.current.open = false;
            syncComparison();
            requestAnimationFrame(() => changeDetails.current?.querySelector('summary')?.focus({ preventScroll: true }));
          }}>Remove comparison from this copy</button>
        </details>}
  </>;
  return <aside className={`tailor-pane ${comparing && !busy ? 'is-comparing' : ''} ${stopMessage ? 'has-stop-message' : ''}`} aria-labelledby="tailor-heading" aria-busy={busy}>
    <header className="tailor-heading"><span className="tailor-mark"><Sparkles size={20} /></span><div><h2 id="tailor-heading">CV Tailor</h2><p>A focused resume from your real content.</p></div></header>
    <div className="tailor-scroll" role="region" aria-label="CV tailoring inputs" tabIndex={0}>
      <div className="tailor-feedback" role="note"><strong>{previewLabel}</strong><p>Experimental tailoring preview. Review every claim; factual safety, writing quality and latency are not certified. Use fictional data while evaluating free-tier access.</p></div>
      {message && !stopMessage && <div className="tailor-feedback" role="status"><p>{message}</p></div>}
      {active?.compositionChanges && <details className="tailor-review" open ref={changeDetails} onToggle={syncComparison}>
        <summary>What changed during tailoring</summary>
        <p>This compares the copy with its source at the time it was made. Later edits are not included. It is not a quality or factual accuracy assessment.</p>
        <p>Mode used for this copy: {active.compositionChanges.mode === 'source-wording' ? 'Keep source wording (summary and work/project text were not rewritten)' : active.compositionChanges.mode === 'rewrite' ? 'AI rewriting allowed (changes were not guaranteed)' : 'Not recorded for this older copy'}.</p>
        {active.compositionChanges.mode === 'source-wording' && active.compositionChanges.sourceReordering !== undefined && <p>AI bullet reordering was {active.compositionChanges.sourceReordering ? 'allowed; review context carefully' : 'off; original order was kept'}.</p>}
        {historyControls}
        <p>Summary: {active.compositionChanges.summary === 'changed' ? 'Wording changed' : 'Unchanged'}.</p>
        {currentSource && <details ref={summaryDetails} onToggle={syncComparison}>
          <summary ref={summaryHeading}>Compare current summaries</summary>
          <p>This compares the current source and copy, not a generation-time snapshot; either may have changed since tailoring. Summary text uses the resume preview’s text projection; formatting is not shown. It does not verify meaning or factual accuracy. Edit the copy in the editor after reviewing.</p>
          <p><strong>Current source summary</strong></p><p dir="auto" style={{ whiteSpace: 'pre-wrap' }}>{plainText(currentSource.summary.data) || '(Empty)'}</p>
          <p><strong>Current tailored summary</strong></p><p dir="auto" style={{ whiteSpace: 'pre-wrap' }}>{plainText(active.summary.data) || '(Empty)'}</p>
          <button type="button" className="text-button" onClick={() => { if (summaryDetails.current) summaryDetails.current.open = false; syncComparison(); summaryHeading.current?.focus({ preventScroll: true }); summaryHeading.current?.scrollIntoView({ block: 'start' }); }}>Close summary comparison</button>
        </details>}
        <p>Experience: {entryChangeText[active.compositionChanges.experience]}.</p>
        <p>Projects: {entryChangeText[active.compositionChanges.projects]}.</p>
        {currentSource ? <details ref={comparisonDetails} onToggle={syncComparison}>
          <summary ref={comparisonSummary}>Compare current experience and projects</summary>
          <p>On smaller screens, close this comparison to return to the tailoring controls. If a request is running, cancellation stays available.</p>
          <CurrentEntryComparison source={currentSource} copy={active} />
          <button type="button" className="text-button" onClick={() => { if (comparisonDetails.current) comparisonDetails.current.open = false; syncComparison(); comparisonSummary.current?.focus({ preventScroll: true }); comparisonSummary.current?.scrollIntoView({ block: 'start' }); }}>Close comparison and return to tailoring</button>
        </details> : <p>The source resume is not available, so a current comparison cannot be displayed. The change summary describes when the copy was made.</p>}
        {active.compositionChanges.proposal && <p>Before local checks, the AI proposed {active.compositionChanges.proposal.proposed} work/project bullet lines; {active.compositionChanges.proposal.different} did not exactly match a source passage in the same entry. These counts cover the first response for each unlocked entry, not quality or accuracy.</p>}
        <p>Skills: {active.compositionChanges.skills.retained} retained; {active.compositionChanges.skills.excluded.length} not selected for this copy{active.compositionChanges.skills.added ? `; ${active.compositionChanges.skills.added} added` : ''}.</p>
        {active.compositionChanges.skills.reordered && <p>Selected skills were reordered.</p>}
        {active.compositionChanges.skills.regrouped && <p>Some selected skills were moved to different groups.</p>}
        {!!missingSourceSkills.length && <details>
          <summary>Review skills in the current source</summary>
          <p>These source skills are not in this copy. The source may have changed since tailoring. Add only skills relevant to the job; name, qualification and category are copied from the current source. The historical counts above do not change.</p>
          <ul>{missingSourceSkills.map(skill => <li key={skill.id}><span dir="auto">{skill.name}{skill.level ? ` — ${skill.level}` : ''} ({skill.category})</span> {active.skills.data.some(item => item.name.trim().toLocaleLowerCase() === skill.name.trim().toLocaleLowerCase()) && <span>A skill with this name is already in the copy; compare its qualification and category before adding. </span>}<button type="button" className="text-button" disabled={busy || active.skills.isLocked} onClick={() => restoreSourceSkill(skill.id)}>Add to this copy</button></li>)}</ul>
          {active.skills.isLocked && <p>Unlock Skills in the editor to add a skill.</p>}
        </details>}
        {active.compositionChanges.skills.excluded.length > 0 && <details>
          <summary>Skills not selected for this copy</summary>
          <ul>{active.compositionChanges.skills.excluded.map((skill, i) => <li key={i}>{skill.name}{skill.level ? ` — ${skill.level}` : ''}</li>)}</ul>
          <p>{currentSource ? 'These are historical names; check the current source to see what remains there.' : 'The source resume is unavailable; these historical names do not establish what is in it now.'}</p>
        </details>}
      </details>}
      {active && !active.compositionChanges && (hasStoredSnapshot || active.compositionSnapshotStatus !== undefined) && <details className="tailor-review" open ref={changeDetails} onToggle={syncComparison}>
        <summary>Generation text comparison</summary>
        {historyControls}
      </details>}
      <div className="tailor-source"><div className="tailor-source-heading"><label htmlFor="composer-source">Source resume</label><button className="text-button" disabled={busy} onClick={onImport}><Upload size={15} />Import CV</button></div>
        <select id="composer-source" value={activeId ?? ''} disabled={busy} onChange={e => { setActive(e.target.value); setMessage(''); setNotes([]); }}>{profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.profileName}</option>)}</select>
        <p>Uses the currently selected resume, including your edits. Creates a separate copy; your original, identity, dates, design and locked sections stay unchanged.</p>
        <label><input type="checkbox" checked={saveComparison} disabled={busy} onChange={e => setSaveComparison(e.target.checked)} /> Save a generation text comparison on the new copy</label>
        <p>This stores a separate local comparison of source and final summary, experience and projects. It duplicates professional text, stays after source deletion, and can be removed from the copy. Contact fields, photos, the job, private-note sections and project links are excluded, but personal information typed in professional fields is retained. Other change notes may also remain even if this option is off. If the comparison is too large or a link or contact is detected in professional text, no comparison is stored; detection is incomplete and no text is truncated.</p>
        <button className="text-button" disabled={busy} onClick={onEditOriginal}>Open source editor</button>
        <p>If you want to add a personal interest or career direction that is missing from the imported CV, explicitly write it in the source editor first. The job description and skill list do not establish your interests.</p>
        {active?.importedFrom && <button className="text-button" disabled={busy} onClick={() => onReviewImport(active.importedFrom!)}>Review imported content</button>}
      </div>
      <div className="tailor-job"><label><input type="checkbox" checked={keepSourceWording} disabled={busy} onChange={e => setKeepSourceWording(e.target.checked)} /> Keep source wording</label><p>Keeps the current source summary and all work/project text exactly as written, in the original order by default. AI may select or regroup skills, and some skills may be left out of the copy. Uncheck to allow rewriting; locked sections stay unchanged. Neither mode verifies facts.</p>
        {keepSourceWording && <><label><input type="checkbox" checked={allowSourceReorder} disabled={busy} onChange={e => setAllowSourceReorder(e.target.checked)} /> Allow AI to reorder original bullets</label><p>Reordering can separate a statement from its context or limits. Compare the copy with your source. The app cannot detect every dependency.</p></>}
      </div>
      <div className="tailor-job"><label htmlFor="composer-model">AI model</label><select id="composer-model" disabled={busy} value={model} onChange={e => setModel(e.target.value as CompositionModel)}>{COMPOSITION_MODELS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><p>Experimental selection. Availability, cost and writing quality vary by model. The selected model is tried first. On HTTP {TRANSIENT_HTTP_STATUSES.join(', ')} or an output-limit (MAX_TOKENS) response, the same content may automatically be sent to other models, in this order: {liveModels.join(" → ")}. Up to {liveModels.length} requests may be made and provider charges may apply to each, even if a request timed out.</p></div>
      <div className="tailor-job"><label htmlFor="composer-job">Job description</label><textarea id="composer-job" dir="auto" value={job} disabled={busy} maxLength={32000} placeholder="Paste the full job description…" onChange={e => setJob(e.target.value)} /><p>{job.length.toLocaleString()} / 32,000 characters. Minimum 40.</p></div>
      {usage && <details className="tailor-review"><summary>Latest model request</summary><p>Provider request status: {usage.status}. Selected model: {usage.model}. {usage.lastModel ? `Last requested model: ${usage.lastModel}. ` : ''}{usage.attempts} {usage.attempts === 1 ? 'request' : 'requests'} attempted.</p><p>Latest response reported {usage.total ?? 'an unreported number of'} total tokens. When multiple requests occur, this is not their combined usage or a cost estimate; failed requests may also incur charges. Provider success does not establish output quality or that a copy was saved.</p></details>}
      {!!notes.length && <details className="tailor-review"><summary>Content review notes · {notes.length}</summary><p>Limited local checks, not factual verification. Review the wording in the editor.</p>{notes.map((n, i) => <p key={i}>{n}</p>)}</details>}
    </div>
    <footer className="tailor-footer">{stopMessage && <div className="tailor-feedback" role="status"><p>{message}</p></div>}<div className={`tailor-connection ${connection.ready ? 'is-ready' : ''}`}><span />{busy ? 'Writing your tailored copy…' : connection.ready ? previewLabel : 'AI server/setup required'}</div>
      {busy ? <button className="secondary-button" onClick={() => { controller.current?.abort(); runner.current?.cancel(); }}><X size={16} />Cancel tailoring</button> : <button className="primary-button" disabled={!connection.ready || !active || job.trim().length < 40} onClick={() => void tailor()}><Sparkles size={16} />Tailor CV</button>}
      {busy && <p><Loader2 size={14} className="spin" />Tailoring in progress. Automatic model fallback may occur after a temporary server error or output-limit response.</p>}
      <p>Tailor CV sends professional resume content and this job to Google; automatic fallback may send the same content again. Contact fields, photos and private-note sections are excluded, but personal information typed into professional content or the job can be sent. Check both before tailoring. Professional fields can contain personal information; the local generation comparison keeps their text verbatim. Free-tier quota may apply. No interview or extra AI review is required. New text is not factually certified. Edit and review before export.</p>
    </footer>
  </aside>;
}
