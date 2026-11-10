import { useEffect, useRef, useState } from 'react';
import { Sparkles, Upload, Loader2, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { ImportMetadata } from '@/types/schema';
import { CompositionError } from '@/services/resumeComposer/core';
import { createStoreComposer } from '@/services/resumeComposer/store';
import { requestComposition, liveCompositionCandidates, COMPOSITION_MODEL, COMPOSITION_MODELS, COMPOSITION_PREVIEW_LABEL, type CompositionModel } from '@/services/resumeComposer/request';
import { TailorError } from '@/services/tailorModel';
import { getTailorConnection, readLatestTailorUsage, type TailorUsageRecord } from '@/services/tailorRequest';
import { summaryBoundaryNotice } from '@/services/resumeComposer/summaryBoundary';
const entryChangeText = {
  empty: 'No entries',
  unchanged: 'Wording and order unchanged',
  reordered: 'Wording unchanged; order changed',
  edited: 'Wording or content changed',
} as const;
export function TailorWorkspace({ onCreated, onEditOriginal, onImport, onReviewImport }: { onCreated: (profileId: string, notice: string, reviewNotes: string[]) => void; onEditOriginal: () => void; onImport: () => void; onReviewImport: (data: ImportMetadata) => void }) {
  const profiles = useAppStore(s => s.profiles), activeId = useAppStore(s => s.activeProfileId), setActive = useAppStore(s => s.setActiveProfile);
  const active = profiles.find(p => p.profileId === activeId);
  const currentSource = active?.baseProfileId ? profiles.find(p => p.profileId === active.baseProfileId) : undefined;
  const [job, setJob] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [usage, setUsage] = useState<TailorUsageRecord | null>(null);
  const [model, setModel] = useState<CompositionModel>(COMPOSITION_MODEL);
  const selectedModel = useRef<CompositionModel>(COMPOSITION_MODEL);
  const modelLabel = COMPOSITION_MODELS.find(option => option.id === model)!.label;
  const liveModels = liveCompositionCandidates(model).map(id => COMPOSITION_MODELS.find(option => option.id === id)!.label);
  const previewLabel = model === COMPOSITION_MODEL ? COMPOSITION_PREVIEW_LABEL : `Single-draft preview · ${modelLabel} · experimental`;
  const runner = useRef<ReturnType<typeof createStoreComposer>>();
  if (!runner.current) runner.current = createStoreComposer((packet, signal) => requestComposition(packet, signal, selectedModel.current));
  const controller = useRef<AbortController>(), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); runner.current?.cancel(); }; }, []);
  const connection = getTailorConnection();
  async function tailor() {
    if (controller.current || !active) return;
    selectedModel.current = model;
    const task = new AbortController(); controller.current = task;
    const previousUsageId = readLatestTailorUsage()?.id;
    setBusy(true); setMessage(''); setNotes([]); setUsage(null);
    try {
      const result = await runner.current!.run(job, task.signal);
      if (!alive.current) return;
      const notice = summaryBoundaryNotice(result.summaryRemovals.length, result.summarySegments.length);
      const reviewNotes = [...result.warnings.map(w => `${w.path}: ${w.message}`), ...result.normalizations.map(n => n.reason)];
      setNotes(reviewNotes);
      const draft = result.proposalComparison;
      const unchangedDetail = ` The AI proposed ${draft.proposed} work/project bullet lines; ${draft.different} did not exactly match a source passage in the same entry before local checks. This is not a quality or accuracy assessment.`;
      setMessage((result.status === 'created' ? 'A new editable copy is open. Your original is unchanged. Check the content before exporting; browser save status is shown above.' : `The content was unchanged. No duplicate copy was created.${unchangedDetail}`) + (notice ? ` ${notice}` : ''));
      if (result.status === 'created') onCreated(result.profileId, notice, reviewNotes);
    } catch (e) {
      if (alive.current) setMessage(e instanceof CompositionError || e instanceof TailorError ? e.message : 'Could not complete tailoring. Check your original before trying again.');
    } finally { if (controller.current === task) { controller.current = undefined; if (alive.current) { const latest = readLatestTailorUsage(); setUsage(latest && latest.id !== previousUsageId ? latest : null); setBusy(false); } } }
  }
  return <aside className="tailor-pane" aria-labelledby="tailor-heading" aria-busy={busy}>
    <header className="tailor-heading"><span className="tailor-mark"><Sparkles size={20} /></span><div><h2 id="tailor-heading">CV Tailor</h2><p>A focused resume from your real content.</p></div></header>
    <div className="tailor-scroll" role="region" aria-label="CV tailoring inputs" tabIndex={0}>
      <div className="tailor-feedback" role="note"><strong>{previewLabel}</strong><p>Experimental tailoring preview. Review every claim; factual safety, writing quality and latency are not certified. Use fictional data while evaluating free-tier access.</p></div>
      {message && <div className="tailor-feedback" role="status"><p>{message}</p></div>}
      {active?.compositionChanges && <details className="tailor-review" open>
        <summary>What changed during tailoring</summary>
        <p>This compares the copy with its source at the time it was made. Later edits are not included. It is not a quality or factual accuracy assessment.</p>
        <p>Summary: {active.compositionChanges.summary === 'changed' ? 'Wording changed' : 'Unchanged'}.</p>
        {currentSource && <details>
          <summary>Compare current summaries</summary>
          <p>This compares the current source and copy; either may have changed since tailoring. Edit the copy in the editor after reviewing.</p>
          <p><strong>Current source summary</strong></p><p style={{ whiteSpace: 'pre-wrap' }}>{currentSource.summary.data || '(Empty)'}</p>
          <p><strong>Current tailored summary</strong></p><p style={{ whiteSpace: 'pre-wrap' }}>{active.summary.data || '(Empty)'}</p>
        </details>}
        <p>Experience: {entryChangeText[active.compositionChanges.experience]}.</p>
        <p>Projects: {entryChangeText[active.compositionChanges.projects]}.</p>
        {currentSource && <details>
          <summary>Compare current experience and projects</summary>
          <p>These are the current versions, not a saved before-and-after snapshot. Check actions, outcomes, qualifications and attribution; edit the tailored copy in the editor.</p>
          {[{ label: 'Current source', profile: currentSource }, { label: 'Current tailored copy', profile: active }].map(({ label, profile }) => <section key={label} aria-label={label}>
            <strong>{label}</strong>
            {profile.experience.data.map(entry => <div key={entry.id}><p>{entry.roleTitle}{entry.companyName ? ` · ${entry.companyName}` : ''}</p>{entry.description && <p style={{ whiteSpace: 'pre-wrap' }}>{entry.description}</p>}<ul>{entry.bullets.map(b => <li key={b.id} style={{ whiteSpace: 'pre-wrap' }}>{b.text}</li>)}</ul></div>)}
            {profile.projects.data.map(entry => <div key={entry.id}><p>{entry.name}</p><ul>{entry.bullets.map(b => <li key={b.id} style={{ whiteSpace: 'pre-wrap' }}>{b.text}</li>)}</ul></div>)}
            {!profile.experience.data.length && !profile.projects.data.length && <p>No experience or project entries.</p>}
          </section>)}
        </details>}
        {active.compositionChanges.proposal && <p>Before local checks, the AI proposed {active.compositionChanges.proposal.proposed} work/project bullet lines; {active.compositionChanges.proposal.different} did not exactly match a source passage in the same entry. These counts cover the first response for each unlocked entry, not quality or accuracy.</p>}
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
        <p>If you want to add a personal interest or career direction that is missing from the imported CV, explicitly write it in the source editor first. The job description and skill list do not establish your interests.</p>
        {active?.importedFrom && <button className="text-button" disabled={busy} onClick={() => onReviewImport(active.importedFrom!)}>Review imported content</button>}
      </div>
      <div className="tailor-job"><label htmlFor="composer-model">AI model</label><select id="composer-model" disabled={busy} value={model} onChange={e => setModel(e.target.value as CompositionModel)}>{COMPOSITION_MODELS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><p>Experimental selection. Availability, cost and writing quality vary by model. The selected model is tried first. On HTTP 503 or an incomplete response, the same content may automatically be sent to other models, in this order: {liveModels.join(" → ")}. Up to {liveModels.length} requests may be made and provider charges may apply to each.</p></div>
      <div className="tailor-job"><label htmlFor="composer-job">Job description</label><textarea id="composer-job" dir="auto" value={job} disabled={busy} maxLength={32000} placeholder="Paste the full job description…" onChange={e => setJob(e.target.value)} /><p>{job.length.toLocaleString()} / 32,000 characters. Minimum 40.</p></div>
      {usage && <details className="tailor-review"><summary>Latest model request</summary><p>Provider request status: {usage.status}. Selected model: {usage.model}. {usage.lastModel ? `${usage.status === 'success' ? 'Model producing the response' : 'Last model attempted'}: ${usage.lastModel}. ` : ''}{usage.attempts} {usage.attempts === 1 ? 'request' : 'requests'} attempted.</p><p>Latest response reported {usage.total ?? 'an unreported number of'} total tokens. When multiple requests occur, this is not their combined usage or a cost estimate; failed requests may also incur charges. Provider success does not establish output quality or that a copy was saved.</p></details>}
      {!!notes.length && <details className="tailor-review"><summary>Content review notes · {notes.length}</summary><p>Limited local checks, not factual verification. Review the wording in the editor.</p>{notes.map((n, i) => <p key={i}>{n}</p>)}</details>}
    </div>
    <footer className="tailor-footer"><div className={`tailor-connection ${connection.ready ? 'is-ready' : ''}`}><span />{busy ? 'Writing your tailored copy…' : connection.ready ? previewLabel : 'AI server/setup required'}</div>
      {busy ? <button className="secondary-button" onClick={() => { controller.current?.abort(); runner.current?.cancel(); }}><X size={16} />Cancel tailoring</button> : <button className="primary-button" disabled={!connection.ready || !active || job.trim().length < 40} onClick={() => void tailor()}><Sparkles size={16} />Tailor CV</button>}
      {busy && <p><Loader2 size={14} className="spin" />Tailoring in progress. Automatic model fallback may occur after a 503 or incomplete response.</p>}
      <p>Tailor CV sends professional resume content and this job to Google; automatic fallback may send the same content again. Contact fields, photos and private-note sections are excluded, but personal information typed into professional content or the job can be sent. Check both before tailoring. Free-tier quota may apply. No interview or extra AI review is required. New text is not factually certified. Edit and review before export.</p>
    </footer>
  </aside>;
}
