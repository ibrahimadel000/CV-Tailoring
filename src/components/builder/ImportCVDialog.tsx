import { useEffect, useRef, useState, type DragEvent } from 'react';
import { AlertCircle, FileText, HardDrive, Loader2, Upload, X } from 'lucide-react';
import type { ImportMetadata } from '@/types/schema';
import { CVImportError } from '@/services/cvImportModel';
import { importCVFile, importPastedCVText } from '@/services/cvImportWorkflow';

export function ImportCVDialog({ onClose, onImported, review }: { onClose: () => void; onImported: () => void; review?: ImportMetadata }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const errorNode = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const returnFocus = useRef<HTMLElement | null>(null);
  const close = () => { const current = controller.current; controller.current = null; current?.abort(); onClose(); };
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => { controller.current?.abort(); dialog.current?.close(); if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { if (error) requestAnimationFrame(() => errorNode.current?.scrollIntoView({ block: 'nearest' })); }, [error]);
  const importFile = async (files: FileList | null) => {
    if (!files?.length || controller.current) return;
    if (files.length !== 1) { setError('Choose one resume at a time. No files were imported.'); return; }
    const file = files[0]; const task = new AbortController(); controller.current = task;
    setBusy(true); setError(''); setFileName(file.name); setDragging(false);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; task.abort(); }, 45000);
    try {
      await importCVFile(file, task.signal);
      if (!task.signal.aborted) { controller.current = null; onImported(); }
    } catch (e) {
      if (controller.current === task) {
        setError(timedOut ? 'Reading the file took too long. Try a smaller resume file. Nothing was imported.' : e instanceof CVImportError ? e.message : 'This file could not be imported. Your existing resumes are unchanged.');
      }
    } finally {
      clearTimeout(timer);
      if (controller.current === task) { controller.current = null; setBusy(false); }
    }
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setDragging(false); if (!busy) void importFile(e.dataTransfer.files); };
  const importPasted = async () => {
    if (!pastedText.trim() || controller.current) return;
    const task = new AbortController(); controller.current = task;
    setBusy(true); setError(''); setFileName('Pasted resume');
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; task.abort(); }, 45000);
    try {
      await importPastedCVText(pastedText, task.signal);
      if (!task.signal.aborted) { controller.current = null; onImported(); }
    } catch (e) {
      if (controller.current === task) {
        setError(timedOut ? 'Importing the pasted text took too long. Nothing was imported.' : e instanceof CVImportError ? e.message : 'Could not parse the pasted text.');
      }
    } finally {
      clearTimeout(timer);
      if (controller.current === task) { controller.current = null; setBusy(false); }
    }
  };
  return <dialog ref={dialog} className="studio-modal import-dialog" aria-labelledby="import-dialog-title" onCancel={e => { e.preventDefault(); close(); }}>
    <div className="modal-heading"><h2 id="import-dialog-title">{review ? 'Import details' : 'Import your resume'}</h2><button className="icon-button" aria-label="Close import dialog" onClick={close}><X size={20} /></button></div>
    <div className="import-dialog-body">
      {review ? <>
        <div className="import-file-heading"><FileText size={22} /><div><strong>{review.fileName}</strong><span>{review.format.toUpperCase()}{review.pages ? ` · ${review.pages} ${review.pages === 1 ? 'page' : 'pages'}` : ''} · {review.method === 'ai' ? 'AI-assisted import' : 'Imported locally'}</span></div></div>
        <p className="import-intro">Your editable resume uses this workspace’s template. The text below is the extraction snapshot, not your later edits.</p>
        <ul className="import-warnings">{review.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        <details className="import-source"><summary>Extracted source text</summary><label htmlFor="import-source-text">Read-only extraction snapshot</label><textarea id="import-source-text" value={review.sourceText} readOnly dir="auto" /></details>
        <button className="primary-button import-done" onClick={close}>Continue editing</button>
      </> : <>
        <p className="import-intro">Already have a resume? Bring its content into the editor, then edit it or tailor a separate copy for a job.</p>
        {pasteMode ? (
          <div className="import-paste-box" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label htmlFor="import-paste-textarea" className="sr-only">Paste your resume text</label>
            <textarea id="import-paste-textarea" rows={8} value={pastedText} onChange={e => setPastedText(e.target.value)} placeholder="Paste your resume text here (from Word, LinkedIn, Google Docs, or plain text)…" dir="auto" disabled={busy} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit', fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" className="text-button" disabled={busy} onClick={() => { setPasteMode(false); setError(''); }}>Back to file upload</button>
              <button type="button" className="primary-button" disabled={busy || pastedText.trim().length < 20} onClick={() => { void importPasted(); }}>{busy ? 'Importing…' : 'Import pasted text'}</button>
            </div>
          </div>
        ) : (
          <div className={`import-dropzone ${dragging ? 'is-dragging' : ''} ${busy ? 'is-reading' : ''}`} onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={e => { if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setDragging(false); }} onDrop={drop}>
            {busy ? <Loader2 size={28} className="spin" /> : <Upload size={28} />}
            <strong>{busy ? 'Reading your resume…' : 'Drop your resume here'}</strong>
            <span>{busy ? fileName : 'PDF, DOCX, TXT, Markdown, or PNG/JPG · Up to 10 MB'}</span>
            {!busy && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}><button className="primary-button" onClick={() => picker.current?.click()}><FileText size={17} />Choose file</button><button type="button" className="text-button" onClick={() => { setPasteMode(true); setError(''); }}>or paste text</button></div>}
            <input ref={picker} type="file" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/png,image/jpeg,image/webp" aria-label="Choose CV file" hidden disabled={busy} onChange={e => { void importFile(e.target.files); e.target.value = ''; }} />
          </div>
        )}
        {error && <div ref={errorNode} className="import-error" role="alert"><AlertCircle size={18} /><p>{error}</p></div>}
        <div className="import-expectations"><p><strong>Content, not the original design.</strong> Sections are mapped where clear. Uncertain text stays in editable sections for you to check.</p><p>Clean text PDFs &amp; DOCX are read instantly in your browser. Scanned PDFs, photos, or complex layouts automatically fall back to AI extraction when the server is configured.</p></div>
        <div className="import-local-note"><HardDrive size={17} /><span>Standard text PDFs &amp; DOCX are read locally in your browser with zero AI tokens. Only scanned PDFs, photos, or unmapped layouts use AI import when configured.</span></div>
        {busy && <button className="secondary-button import-done" onClick={close}>Cancel import</button>}
      </>}
    </div>
  </dialog>;
}
