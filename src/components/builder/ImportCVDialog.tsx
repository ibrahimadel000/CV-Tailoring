import { useEffect, useRef, useState, type DragEvent } from 'react';
import { AlertCircle, FileText, HardDrive, Loader2, Upload, X } from 'lucide-react';
import type { ImportMetadata } from '@/types/schema';
import { CVImportError } from '@/services/cvImportModel';
import { importCVFile } from '@/services/cvImportWorkflow';

export function ImportCVDialog({ onClose, onImported, review }: { onClose: () => void; onImported: () => void; review?: ImportMetadata }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const errorNode = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
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
  return <dialog ref={dialog} className="studio-modal import-dialog" aria-labelledby="import-dialog-title" onCancel={e => { e.preventDefault(); close(); }}>
    <div className="modal-heading"><h2 id="import-dialog-title">{review ? 'Import details' : 'Import your resume'}</h2><button className="icon-button" aria-label="Close import dialog" onClick={close}><X size={20} /></button></div>
    <div className="import-dialog-body">
      {review ? <>
        <div className="import-file-heading"><FileText size={22} /><div><strong>{review.fileName}</strong><span>{review.format.toUpperCase()}{review.pages ? ` · ${review.pages} ${review.pages === 1 ? 'page' : 'pages'}` : ''} · Imported locally</span></div></div>
        <p className="import-intro">Your editable resume uses this workspace’s template. The text below is the extraction snapshot, not your later edits.</p>
        <ul className="import-warnings">{review.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        <details className="import-source"><summary>Extracted source text</summary><label htmlFor="import-source-text">Read-only extraction snapshot</label><textarea id="import-source-text" value={review.sourceText} readOnly dir="auto" /></details>
        <button className="primary-button import-done" onClick={close}>Continue editing</button>
      </> : <>
        <p className="import-intro">Already have a resume? Bring its content into the editor, then edit it or tailor a separate copy for a job.</p>
        <div className={`import-dropzone ${dragging ? 'is-dragging' : ''} ${busy ? 'is-reading' : ''}`} onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={e => { if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setDragging(false); }} onDrop={drop}>
          {busy ? <Loader2 size={28} className="spin" /> : <Upload size={28} />}
          <strong>{busy ? 'Reading your resume…' : 'Drop your resume here'}</strong>
          <span>{busy ? fileName : 'PDF or DOCX · Up to 10 MB'}</span>
          {!busy && <button className="primary-button" onClick={() => picker.current?.click()}><FileText size={17} />Choose file</button>}
          <input ref={picker} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Choose CV file" hidden disabled={busy} onChange={e => { void importFile(e.target.files); e.target.value = ''; }} />
        </div>
        {error && <div ref={errorNode} className="import-error" role="alert"><AlertCircle size={18} /><p>{error}</p></div>}
        <div className="import-expectations"><p><strong>Content, not the original design.</strong> Sections are mapped where clear. Uncertain text stays in editable sections for you to check.</p><p>Photos are not imported. Scanned/image-only PDFs need OCR and are not supported yet.</p></div>
        <div className="import-local-note"><HardDrive size={17} /><span>Read locally in your browser. No Gemini requests or AI tokens. Extracted text is saved with the new resume in this browser.</span></div>
        {busy && <button className="secondary-button import-done" onClick={close}>Cancel import</button>}
      </>}
    </div>
  </dialog>;
}
