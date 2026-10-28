import type { RejectedDiagnostics } from '@/services/contentEngine/rejectedDiagnostics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Upload, FileText, Info, Loader2, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { ImportMetadata } from '@/types/schema';
import { JOB_LIMIT, resolveTailorSource, TailorError } from '@/services/tailorModel';
import { getTailorConnection, readLatestTailorUsage } from '@/services/tailorRequest';
import { chooseContent, writeContent, saveContent, discardContent, readRejectedContent, type SelectionPreview, type DraftPreview } from '@/services/contentEngine/workflow';
import { defaultChoices, reviewedCopy, type Choices } from '@/services/contentEngine/native';
import { resumeBlocks } from './resumeModel';
const DRAFT_KEY = 'cv-tailor-job-draft-v1';
export function TailorWorkspace({ onCreated, onEditOriginal, onImport, onReviewImport }: { onCreated: () => void; onEditOriginal: () => void; onImport: () => void; onReviewImport: (data: ImportMetadata) => void }) {
  const profiles = useAppStore(s => s.profiles), activeId = useAppStore(s => s.activeProfileId), setActive = useAppStore(s => s.setActiveProfile);
  const active = profiles.find(p => p.profileId === activeId), resolved = active ? resolveTailorSource(active, profiles) : undefined, source = resolved?.source;
  const [job, setJob] = useState(() => { try { return (localStorage.getItem(DRAFT_KEY) ?? '').slice(0, JOB_LIMIT); } catch { return ''; } });
  const [plan, setPlan] = useState<SelectionPreview | null>(null), [draft, setDraft] = useState<DraftPreview | null>(null);
  const [choices, setChoices] = useState<Choices>({ summary: true, skills: true, entries: [] });
  const [rejected, setRejected] = useState<RejectedDiagnostics | null>(null), [includeRejected, setIncludeRejected] = useState(false);
  const [failure, setFailure] = useState<{ stage: 'selection' | 'writing'; message: string } | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [consent, setConsent] = useState(false), [usage, setUsage] = useState(readLatestTailorUsage);
  const controller = useRef<AbortController | null>(null), sessionId = useRef<string | undefined>(undefined), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); discardContent(sessionId.current); }; }, []);
  const preview = useMemo(() => draft ? reviewedCopy(draft.source, draft.candidate, draft.draft, choices) : null, [draft, choices]);
  const connection = getTailorConnection(), frozen = busy || !!plan;
  const discard = () => { discardContent(sessionId.current); setRejected(null); setIncludeRejected(false); sessionId.current = undefined; setPlan(null); setDraft(null); setConsent(false); setFailure(null); setMessage('Review discarded. No resume was changed.'); };
  async function run() {
    if (controller.current || !source || !consent) return;
    const task = new AbortController(); controller.current = task; setBusy(true); setRejected(null); setIncludeRejected(false); setFailure(null); setMessage(''); setConsent(false);
    try {
      if (!plan) {
        const out = await chooseContent(source.profileId, job, task.signal);
        if (!alive.current) { discardContent(out.id); return; }
        sessionId.current = out.id; setPlan(out);
        setMessage('Editorial direction and content selected. No writing request or save has happened. Review the selection, then explicitly authorize writing.');
      } else {
        const out = await writeContent(plan.id, task.signal);
        if (!alive.current) return;
        setDraft(out); setChoices(defaultChoices(out.draft));
        setMessage('Draft ready for your review, not saved or independently verified. The original remains unchanged.');
      }
    } catch (e) { if (alive.current) { const text = e instanceof TailorError ? e.message : 'This stage could not complete. No resume was changed; no automatic retry.'; setMessage(text); setRejected(readRejectedContent()); setFailure({ stage: plan ? 'writing' : 'selection', message: text }); } }
    finally { if (controller.current === task) { controller.current = null; if (alive.current) { setBusy(false); setUsage(readLatestTailorUsage()); } } }
  }
  function save() {
    if (!draft) return;
    try { saveContent(draft.id, choices); sessionId.current = undefined; setPlan(null); setDraft(null); setConsent(false); setMessage('Saved as a separate editable copy. Export uses the same saved content.'); onCreated(); }
    catch (e) { setMessage(e instanceof TailorError ? e.message : 'Could not save. The original remains unchanged.'); }
  }
  function download() {
    if (!plan && !failure) return;
    const data = { version: 'editorial-writing-b29', engineRevision: 'b29.2', model: connection.model, job, source: plan?.facts ?? null, sourceProfileId: plan?.source.profileId ?? null, selection: plan?.selection ?? null, editorial: plan?.editorial ?? null, duplicateCount: plan?.duplicateCount ?? 0, failure, rejectedDiagnostics: rejected ? { stage: rejected.stage, issueCount: rejected.issueCount, issues: rejected.issues, issuesShortened: rejected.issuesShortened, snapshotIncluded: includeRejected, ...(includeRejected ? { snapshot: rejected.snapshot, snapshotLimited: rejected.snapshotLimited, notice: rejected.notice } : {}) } : null, draft: draft?.draft ?? null, reviewedChoices: choices, scopeActions: draft?.scopeActions ?? [], advisories: draft?.advisories ?? [], latestUsage: usage };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'CV-Tailor-Batch29.2-Result.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const fact = (id: string) => plan?.facts.evidence.find(f => f.id === id)?.text ?? id;
  const items = plan ? [...plan.facts.experience, ...plan.facts.projects] : [];
  return <aside className={`tailor-pane ${draft ? 'is-reviewing' : ''}`} aria-labelledby="tailor-heading" aria-busy={busy}>
    <header className="tailor-heading"><span className="tailor-mark"><Sparkles size={20} /></span><div><h2 id="tailor-heading">CV Tailor</h2><p>A focused resume from your real content.</p></div></header>
    <div className="tailor-scroll" role="region" aria-label="CV tailoring inputs" tabIndex={0}>
      {message && <div className="tailor-feedback" role="status"><Info size={17} /><p>{message}</p></div>}
      <div className="tailor-source"><div className="tailor-source-heading"><label htmlFor="tailor-source">Source resume</label><button className="text-button" disabled={frozen} onClick={onImport}><Upload size={15} />Import CV</button></div>
        <div className="tailor-source-select"><FileText size={17} /><select id="tailor-source" value={source?.profileId ?? ''} disabled={frozen} onChange={e => { setActive(e.target.value); setMessage(''); setConsent(false); }}>{profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.profileName}</option>)}</select></div>
        <p>Your source, identity, dates, design and extra sections stay unchanged. Saving creates a separate copy.</p>
        {resolved?.missingOriginal && <p className="tailor-source-warning">The original is unavailable; this uses the current resume.</p>}
        {source?.importedFrom && <button className="text-button import-source-review" disabled={frozen} onClick={() => onReviewImport(source.importedFrom!)}>Review imported content</button>}
        <button className="text-button" disabled={frozen} onClick={() => { if (source) setActive(source.profileId); onEditOriginal(); }}>Open source editor</button>
      </div>
      <div className="tailor-job"><div className="tailor-field-heading"><label htmlFor="tailor-job-description">Job description</label></div>
        <textarea id="tailor-job-description" dir="auto" value={job} disabled={frozen} maxLength={JOB_LIMIT} placeholder="Paste the full job description…" onChange={e => { setJob(e.target.value); setConsent(false); try { localStorage.setItem(DRAFT_KEY, e.target.value); } catch { setMessage('Job draft could not be stored. Keep a local copy before leaving.'); } }} />
        <p>{job.length.toLocaleString()} / {JOB_LIMIT.toLocaleString()} characters. Minimum 60.</p>
      </div>
      {rejected && <section className="tailor-review" aria-label="Rejected response diagnostics"><h3>Rejected response diagnostics</h3><p>This response was not accepted. Writing and saving are blocked for a rejected selection. No repair or retry is automatic.</p><p>Validation issues: {rejected.issueCount}{rejected.issuesShortened ? ' (first 100 shown)' : ''}</p>{rejected.issues.map((x, i) => <p key={i}>{x.path}: {x.message}</p>)}
        <details><summary>Preview rejected response locally — not applied</summary><p>{rejected.notice}</p><pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{JSON.stringify(rejected.snapshot, null, 2)}</pre></details>
        <label><input type="checkbox" checked={includeRejected} onChange={e => setIncludeRejected(e.target.checked)} /> Include the sanitized rejected-response snapshot in the downloaded report</label><p>Off by default. May contain professional resume or job text. Review the local preview before sharing. Never stored in a resume or usage log; cleared when you discard, start another attempt or leave.</p>
      </section>}
      {failure && !plan && <button className="text-button" onClick={download}>Download failed-stage report</button>}
      {active?.tailoring && !plan && <section className="tailor-result"><strong>Saved tailoring snapshot</strong><p>{active.tailoring.contentEngine ? `Content engine · ${active.tailoring.contentEngine.version}` : 'Earlier engine snapshot; not regenerated.'} Later editor changes are not re-evaluated automatically.</p><details><summary>Saved changes · {active.tailoring.changes.length}</summary>{active.tailoring.changes.map((c, i) => <div className="tailor-change" key={i}><strong>{c.area}</strong><span>Before</span><p dir="auto">{c.before}</p><span>Accepted</span><p dir="auto">{c.after}</p></div>)}</details></section>}
      {plan && <section className="tailor-pending-review" aria-label="Content selection">
        <h3>1. Selected source content</h3><p>An editorial direction was proposed; no resume text was changed at this stage. Selection is editable by restoring an entire original entry in the final review. To change the source first, discard this session.</p>
        {items.map(item => { const p = plan.selection.entries.find(e => e.id === item.id)!; return <details key={item.id} className="tailor-review"><summary>{item.title} · {item.organization} — {p.passageIds.length} selected, {p.omittedIds.length} omitted</summary><strong>Selected</strong>{p.passageIds.map(id => <p dir="auto" key={id}>{fact(id)}</p>)}{!!p.omittedIds.length && <><strong>Omitted from proposed draft — original retained</strong>{p.omittedIds.map(id => <p dir="auto" key={id}>{fact(id)}</p>)}</>}</details>; })}
        <details className="tailor-review"><summary>Skills · {plan.selection.skillOrder.length} selected / {plan.selection.omittedSkillIds.length} omitted</summary><p>The editor retains its Technical / Tools / Interpersonal / Languages groups. Ordering is within those groups; levels are preserved. Local exact-text duplicate removals: {plan.duplicateCount}.</p><strong>Selected</strong><p dir="auto">{plan.selection.skillOrder.map(fact).join(' · ') || '(None)'}</p><strong>Omitted</strong><p dir="auto">{plan.selection.omittedSkillIds.map(fact).join(' · ') || '(None)'}</p></details>
        <button className="text-button" disabled={busy} onClick={download}>Download experiment report</button><p>Contains resume and job text. Review before sharing; no API key is included.</p>
      </section>}
      {plan && <section className="tailor-review" aria-label="Editorial direction">
        <h3>Editorial direction</h3><p>AI interpretation to review, not verified job coverage or new resume evidence. This plan guides writing; it is not inserted into your CV. Your final choices can differ.</p>
        <strong>What the job actually involves</strong><p dir="auto">{plan.editorial.jobFocus.purpose}</p>
        <strong>Positioning from your existing content</strong><p dir="auto">{plan.editorial.positioning.text}</p>
        <strong>Summary focus</strong><p dir="auto">{plan.editorial.summary.angle || 'Original locked summary retained.'}</p>
        <details><summary>Job priorities and source links</summary>{plan.editorial.jobFocus.priorities.map(p => <div className="tailor-change" key={p.id}><strong dir="auto">{p.description}</strong><blockquote dir="auto">{p.quote}</blockquote><p dir="auto">{plan.editorial.priorityLinks.find(x => x.priorityId === p.id)?.note}</p>{plan.editorial.priorityLinks.find(x => x.priorityId === p.id)?.sourceIds.map(id => <p dir="auto" key={id}>{fact(id)}</p>)}</div>)}</details>
        <details><summary>Skill decisions · core, supporting and omitted</summary>{plan.editorial.skills.map(s => <div className="tailor-change" key={s.id}><strong dir="auto">{fact(s.id)} · {s.tier}</strong>{s.tier === 'supporting' && !s.priorityIds.length && <p>Supporting context only — no direct job-priority match claimed.</p>}<p dir="auto">{s.reason}</p></div>)}</details>
        {!!plan.editorial.omissions.length && <details><summary>Why these passages are omitted</summary>{plan.editorial.omissions.map(x => <div className="tailor-change" key={x.id}><p dir="auto">{fact(x.id)}</p><p dir="auto">{x.reason}</p></div>)}</details>}
      </section>}
      {draft && preview && <section className="tailor-pending-review" aria-label="Review before saving">
        <h3>2. Review before saving</h3><p>Accept the whole proposed entry, including its omissions, or restore that entry in full. No changes are saved yet. Sources identify where text came from; they do not certify its meaning.</p>
        <div className="tailor-change"><label><input type="checkbox" checked={choices.summary} disabled={draft.source.summary.isLocked} onChange={e => setChoices(c => ({ ...c, summary: e.target.checked }))} /> Use proposed summary</label><span>Original summary for comparison</span><p dir="auto">{draft.source.summary.data}</p></div>
        {items.map((item, i) => <div className="tailor-change" key={item.id}><label><input type="checkbox" checked={choices.entries.includes(item.id)} disabled={i < draft.facts.experience.length ? draft.source.experience.isLocked : draft.source.projects.isLocked} onChange={e => setChoices(c => ({ ...c, entries: e.target.checked ? [...c.entries, item.id] : c.entries.filter(id => id !== item.id) }))} /> Use proposed entry: {item.title} · {item.organization}</label><details><summary>Compare against original</summary>{[item.overviewId, ...item.bulletIds].filter(Boolean).map(id => <p dir="auto" key={id}>{fact(id)}</p>)}</details></div>)}
        <label><input type="checkbox" checked={choices.skills} disabled={draft.source.skills.isLocked} onChange={e => setChoices(c => ({ ...c, skills: e.target.checked }))} /> Use selected skills and ordering (uncheck to restore all original skills)</label>
        {!!draft.scopeActions.length && <details className="tailor-review"><summary>Literal source limits retained locally · {draft.scopeActions.length}</summary><p>These exact source suffixes were added locally to cited paragraphs. Partial pattern detection, not complete semantic verification.</p>{draft.scopeActions.map((a, i) => <p dir="auto" key={i}>{a.path}: {a.text}</p>)}</details>}
        {!!draft.advisories.length && <details className="tailor-review"><summary>Review notes · {draft.advisories.length}</summary>{draft.advisories.map((a, i) => <p key={i}>{a}</p>)}</details>}
        <h3>Accepted professional text</h3><p>This is projected from the same native resume object used by the editor and PDF. Contact header is not repeated here. Extra sections are preserved.</p>
        <div data-testid="content-preview">{resumeBlocks(preview).map(block => <section className="tailor-review" key={block.id}><h4>{block.title}</h4>{block.items.map((item, i) => <div className="tailor-change" key={i}>{item.title && <strong dir="auto">{item.title}</strong>}{item.subtitle && <p dir="auto">{item.subtitle}</p>}{item.date && <p dir="auto">{item.date}</p>}{item.text && <p dir="auto">{item.text}</p>}{!!item.bullets?.length && <ul>{item.bullets.map((text, j) => <li dir="auto" key={j}>{text}</li>)}</ul>}</div>)}</section>)}</div>
      </section>}
    </div>
    <footer className="tailor-footer"><div className={`tailor-connection ${connection.ready ? 'is-ready' : ''}`} role="status"><span />{busy ? 'Waiting for Gemini…' : connection.ready ? 'Gemini 2.5 Flash · local development' : 'AI server/setup required'}</div>
      {!draft && !busy && <label><input type="checkbox" checked={consent} disabled={!connection.ready || !source || job.trim().length < 60} onChange={e => setConsent(e.target.checked)} /> Send one {plan ? 'writing' : 'content-selection'} request to Google. Free-tier quota may apply.</label>}
      {busy ? <div className="tailor-working"><span><Loader2 size={17} className="spin" />Processing this stage…</span><button className="text-button" onClick={() => controller.current?.abort()}><X size={16} />Cancel</button></div> : draft ? <div className="tailor-review-actions"><button className="primary-button" onClick={save}>Save reviewed copy</button><button className="secondary-button" onClick={discard}>Discard review</button></div> : <div className="tailor-review-actions"><button className="primary-button" disabled={!connection.ready || !source || !consent || job.trim().length < 60} onClick={() => void run()}>{plan ? 'Write selected content — second AI request' : 'Select content — first AI request'}</button>{plan && <button className="secondary-button" onClick={discard}>Discard selection</button>}</div>}
      {usage && <p>Latest request: {usage.status} · {usage.attempts} attempt · {(usage.elapsedMs / 1000).toFixed(1)}s · {usage.total ?? 'Unreported'} total tokens. Technical success is not a quality verdict.</p>}
      <p>No automatic writing, repair, retry or independent reviewer. Saving sends no AI request. Professional content and job text are sent; contact fields, photos, private notes and import snapshots are excluded. The original remains available. Leaving this screen discards the pending review.</p>
    </footer>
  </aside>;
}
