import { useEffect, useRef, useState } from 'react';
import { Sparkles, Upload, Loader2, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { ImportMetadata } from '@/types/schema';
import { CompositionError } from '@/services/resumeComposer/core';
import { createStoreComposer } from '@/services/resumeComposer/store';
import { requestComposition } from '@/services/resumeComposer/request';
import { TailorError } from '@/services/tailorModel';
import { getTailorConnection } from '@/services/tailorRequest';
import { summaryBoundaryNotice } from '@/services/resumeComposer/summaryBoundary';
export function TailorWorkspace({ onCreated, onEditOriginal, onImport, onReviewImport }: { onCreated: (profileId: string, notice: string) => void; onEditOriginal: () => void; onImport: () => void; onReviewImport: (data: ImportMetadata) => void }) {
  const profiles = useAppStore(s => s.profiles), activeId = useAppStore(s => s.activeProfileId), setActive = useAppStore(s => s.setActiveProfile);
  const active = profiles.find(p => p.profileId === activeId);
  const [job, setJob] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const runner = useRef<ReturnType<typeof createStoreComposer>>();
  if (!runner.current) runner.current = createStoreComposer(requestComposition);
  const controller = useRef<AbortController>(), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); runner.current?.cancel(); }; }, []);
  const connection = getTailorConnection();
  async function tailor() {
    if (controller.current || !active) return;
    const task = new AbortController(); controller.current = task;
    setBusy(true); setMessage(''); setNotes([]);
    try {
      const result = await runner.current!.run(job, task.signal);
      if (!alive.current) return;
      const notice = summaryBoundaryNotice(result.summaryRemovals.length, result.summarySegments.length);
      setNotes([...result.warnings.map(w => `${w.path}: ${w.message}`), ...result.normalizations.map(n => n.reason)]);
      setMessage((result.status === 'created' ? 'A new editable copy is open. Your original is unchanged. Check the content before exporting; browser save status is shown above.' : 'The content was unchanged. No duplicate copy was created.') + (notice ? ` ${notice}` : ''));
      if (result.status === 'created') onCreated(result.profileId, notice);
    } catch (e) {
      if (alive.current) setMessage(e instanceof CompositionError || e instanceof TailorError ? e.message : 'Could not complete tailoring. No automatic retry. Check your original before trying again.');
    } finally { if (controller.current === task) { controller.current = undefined; if (alive.current) setBusy(false); } }
  }
  return <aside className="tailor-pane" aria-labelledby="tailor-heading" aria-busy={busy}>
    <header className="tailor-heading"><span className="tailor-mark"><Sparkles size={20} /></span><div><h2 id="tailor-heading">CV Tailor</h2><p>A focused resume from your real content.</p></div></header>
    <div className="tailor-scroll" role="region" aria-label="CV tailoring inputs" tabIndex={0}>
      {message && <div className="tailor-feedback" role="status"><p>{message}</p></div>}
      <div className="tailor-source"><div className="tailor-source-heading"><label htmlFor="composer-source">Source resume</label><button className="text-button" disabled={busy} onClick={onImport}><Upload size={15} />Import CV</button></div>
        <select id="composer-source" value={activeId ?? ''} disabled={busy} onChange={e => { setActive(e.target.value); setMessage(''); setNotes([]); }}>{profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.profileName}</option>)}</select>
        <p>Uses the currently selected resume, including your edits. Creates a separate copy; your original, identity, dates, design and locked sections stay unchanged.</p>
        <button className="text-button" disabled={busy} onClick={onEditOriginal}>Open source editor</button>
        <p>If you want to add a personal interest or career direction that is missing from the imported CV, explicitly write it in the source editor first. The job description and skill list do not establish your interests.</p>
        {active?.importedFrom && <button className="text-button" disabled={busy} onClick={() => onReviewImport(active.importedFrom!)}>Review imported content</button>}
      </div>
      <div className="tailor-job"><label htmlFor="composer-job">Job description</label><textarea id="composer-job" dir="auto" value={job} disabled={busy} maxLength={32000} placeholder="Paste the full job description…" onChange={e => setJob(e.target.value)} /><p>{job.length.toLocaleString()} / 32,000 characters. Minimum 40.</p></div>
      {!!notes.length && <details className="tailor-review"><summary>Content review notes · {notes.length}</summary><p>Limited local checks, not factual verification. Review the wording in the editor.</p>{notes.map((n, i) => <p key={i}>{n}</p>)}</details>}
    </div>
    <footer className="tailor-footer"><div className={`tailor-connection ${connection.ready ? 'is-ready' : ''}`}><span />{busy ? 'Writing your tailored copy…' : connection.ready ? 'Gemini 2.5 Flash · local development' : 'AI server/setup required'}</div>
      {busy ? <button className="secondary-button" onClick={() => { controller.current?.abort(); runner.current?.cancel(); }}><X size={16} />Cancel tailoring</button> : <button className="primary-button" disabled={!connection.ready || !active || job.trim().length < 40} onClick={() => void tailor()}><Sparkles size={16} />Tailor CV</button>}
      {busy && <p><Loader2 size={14} className="spin" />One request in progress. No automatic retry.</p>}
      <p>Tailor CV sends professional resume content and this job to Google in one request. Contact fields, photos and private notes are excluded. Free-tier quota may apply. No interview or extra AI review is required. New text is not factually certified. Edit and review before export.</p>
    </footer>
  </aside>;
}
