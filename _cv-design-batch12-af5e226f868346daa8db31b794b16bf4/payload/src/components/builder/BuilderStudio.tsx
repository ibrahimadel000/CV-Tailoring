import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, Maximize2, Minimize2, Download, Plus, Copy, Trash2, X, CheckCircle2, SlidersHorizontal, Eye, ArrowLeft, Minus, Info, AlertCircle, Loader2, PencilLine, HardDrive } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { SectionWorkspace } from './SectionWorkspace';
import { getResumePDF } from './pdfPipeline';
import { DesignPanel } from './DesignPanel';
import { essentials, fullName, hasUnsupportedPDFText, type SectionId } from './resumeModel';
import { useBuilderPersistence } from './useBuilderPersistence';
const PDFInspection = lazy(() => import('./PDFInspection'));
const PaginatedPreview = lazy(() => import('./PaginatedPreview'));
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function safeName(name: string) { return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 80) || 'resume'; }
function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className={`studio-modal ${wide ? 'wide-modal' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) { const r = ref.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }} aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</dialog>;
}
export function BuilderStudio() {
  const s = useAppStore();
  const { ready, status, message, retrySave } = useBuilderPersistence();
  const [section, setSection] = useState<SectionId>('personal');
  const [expanded, setExpanded] = useState<SectionId | null>(null);
  const [mobile, setMobile] = useState<'edit' | 'preview'>('edit');
  const [modal, setModal] = useState<'library' | 'pdf' | 'export' | null>(null);
  const [designOpen, setDesignOpen] = useState(false);
  const designHeading = useRef<HTMLHeadingElement>(null);
  const designTrigger = useRef<HTMLButtonElement>(null);
  const closeDesign = () => { setDesignOpen(false); requestAnimationFrame(() => designTrigger.current?.focus({ preventScroll: true })); };
  useEffect(() => {
    if (!designOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented && !modal) { event.preventDefault(); closeDesign(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [designOpen, modal]);
  useEffect(() => { if (designOpen) designHeading.current?.focus({ preventScroll: true }); }, [designOpen]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [exporting, setExporting] = useState(false);
  const [previewFocused, setPreviewFocused] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [stageWidth, setStageWidth] = useState(700);
  const editor = useRef<HTMLDivElement>(null);
  const profile = s.profiles.find(p => p.profileId === s.activeProfileId);
  const checklist = profile ? essentials(profile) : [];
  const fitWidth = Math.min(1, Math.max(0.2, (stageWidth - 48) / 794));
  const scale = zoom ?? fitWidth;
  const unsupportedPDF = profile ? hasUnsupportedPDFText(profile) : false;
  const selectedTemplate = ({ modern: 'Essential', classic: 'Editorial', minimal: 'Compact', split: 'Essential' })[s.documentTheme.layoutStyle];
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 6500); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => { setDesignOpen(false); setSection('personal'); setExpanded(profile && !fullName(profile) ? 'personal' : null); setPreviewFocused(false); editor.current?.scrollTo({ top: 0 }); }, [profile?.profileId]);
  const selectSection = (id: SectionId) => {
    setDesignOpen(false); setSection(id); setExpanded(id); setMobile('edit'); setPreviewFocused(false);
    requestAnimationFrame(() => {
      const container = editor.current;
      const row = container?.querySelector<HTMLElement>(`[data-section-card="${id}"]`);
      if (container && row) container.scrollTo({ top: container.scrollTop + row.getBoundingClientRect().top - container.getBoundingClientRect().top - 12, behavior: 'instant' });
    });
  };
  const showAdd = () => {
    setMobile('edit'); setPreviewFocused(false);
    requestAnimationFrame(() => { const node = document.getElementById('quick-add-sections'); const container = editor.current; if (node && container) container.scrollTo({ top: container.scrollTop + node.getBoundingClientRect().top - container.getBoundingClientRect().top - 16, behavior: 'instant' }); });
  };
  const newResume = () => { s.createProfile('Untitled resume'); setModal(null); selectSection('personal'); };
  const exportPDF = async () => {
    if (!profile || exporting) return;
    if (!fullName(profile)) { setModal(null); selectSection('personal'); setToast('Add your name before exporting your resume.'); return; }
    // The built-in PDF fonts do not support Arabic/CJK. Never silently emit missing glyphs.
    if (unsupportedPDF) { setModal(null); setToast('This release uses Latin PDF fonts. Arabic and other non-Latin PDF export needs a dedicated font/shaping pass; your content is kept in this browser.'); return; }
    setExporting(true);
    try {
      const blob = await getResumePDF(profile, s.documentTheme);
      download(blob, `${safeName(fullName(profile) || profile.profileName)}_Resume.pdf`);
      setToast('Your PDF is ready. Its pages match the live preview.');
      setModal(null);
    } catch { setModal(null); setToast('Could not generate the PDF. Your resume is unchanged. Please try again.'); }
    finally { setExporting(false); }
  };
  if (!ready) return <div className="builder-loading"><div className="brand"><span className="brand-mark"><FileText size={22} /></span>folio<span className="brand-dot">.</span></div>{status === 'error' ? <><AlertCircle size={24} /><h1>We couldn’t open your workspace.</h1><p>{message}</p><button className="primary-button" onClick={() => window.location.reload()}>Reload and retry</button></> : <><Loader2 className="spin" size={24} /><p>Opening your workspace…</p></>}</div>;
  return <div className="builder-app clean-builder">
    <header className="studio-topbar clean-topbar">
      <button className="resume-back" onClick={() => setModal('library')} aria-label="My resumes"><ArrowLeft size={19} /><span>My resumes</span></button>
      <div className="clean-document">{profile ? <input className="document-title" aria-label="Resume document name" value={profile.profileName} maxLength={100} onChange={e => s.updateProfileName(profile.profileId, e.target.value)} onBlur={e => { if (!e.target.value.trim()) s.updateProfileName(profile.profileId, 'Untitled resume'); }} /> : <strong>Your resume workspace</strong>}<div className={`save-state ${status === 'error' ? 'save-error' : ''}`} role="status">{status === 'saved' ? <CheckCircle2 size={12} /> : status === 'saving' ? <Loader2 size={12} className="spin" /> : <AlertCircle size={12} />}<span>{status === 'saved' ? 'Saved in this browser' : status === 'saving' ? 'Saving changes…' : 'Not saved'}</span>{status === 'error' && <button onClick={retrySave}>Retry</button>}</div></div>
      <div className="clean-header-actions"><button className="primary-button clean-export" aria-label="Export PDF" disabled={!profile || exporting} onClick={() => setModal('export')}>{exporting ? <Loader2 size={17} className="spin" /> : <Download size={17} />}<span>Export PDF</span></button></div>
    </header>
    {message && <div className="storage-warning" role="alert"><AlertCircle size={16} />{message}</div>}
    {!profile ? <main className="no-resumes"><span className="empty-plus"><FileText size={30} /></span><span className="eyebrow">A FRESH START</span><h1>Your next chapter starts here.</h1><p>Build a clear, thoughtful resume. One section at a time.</p><button className="primary-button" onClick={newResume}><Plus size={18} />Create a resume</button></main> : <>
      <div className="mobile-workspace-tabs"><button className={mobile === 'edit' ? 'active' : ''} onClick={() => { setDesignOpen(false); setMobile('edit'); setPreviewFocused(false); }}><PencilLine size={16} /> Edit resume</button><button className={mobile === 'preview' ? 'active' : ''} onClick={() => setMobile('preview')}><Eye size={16} /> Live preview</button></div>
      <main className={`studio-workspace clean-workspace mobile-${mobile} ${previewFocused ? 'preview-focused' : ''} ${designOpen ? 'design-open' : ''}`}>
        <section className="editor-pane" aria-label="Resume editor"><div className="clean-editor-heading"><h1>Resume content</h1><button className="text-button" onClick={showAdd}><Plus size={17} />Add section</button></div><div className="editor-scroll" ref={editor}><SectionWorkspace key={profile.profileId} profile={profile} expanded={expanded} onExpand={setExpanded} onSelect={setSection} /></div></section>
        {designOpen && <aside className="design-sheet workspace-design" aria-labelledby="design-heading" id="workspace-design"><div className="modal-heading"><h2 id="design-heading" ref={designHeading} tabIndex={-1}>Design &amp; template</h2><button className="icon-button" aria-label="Close design" onClick={closeDesign}><X size={20} /></button></div><div className="design-sheet-body"><DesignPanel /></div><div className="design-sheet-footer"><button className="primary-button" onClick={closeDesign}>Done</button></div></aside>}
        <section className="preview-pane" aria-label="Resume preview workspace"><Suspense fallback={<div className="pdf-loading"><Loader2 className="spin" size={24} />Loading page preview…</div>}><PaginatedPreview key={profile.profileId} profile={profile} theme={s.documentTheme} scale={scale} section={section} visible={mobile === 'preview'} onWidth={setStageWidth} onEdit={selectSection} /></Suspense><footer className="preview-toolbar clean-preview-toolbar"><button ref={designTrigger} className="text-button design-trigger" aria-expanded={designOpen} aria-controls="workspace-design" onClick={() => { if (designOpen) closeDesign(); else { setPreviewFocused(false); setDesignOpen(true); } }}><SlidersHorizontal size={17} />Design<span className="toolbar-template">{selectedTemplate}</span></button><div className="zoom-controls"><button className="icon-button" aria-label="Zoom out" onClick={() => { setZoom(Math.max(0.15, scale - 0.1)); }}><Minus size={16} /></button><span>{Math.round(scale * 100)}%</span><button className="icon-button" aria-label="Zoom in" onClick={() => { setZoom(Math.min(1.4, scale + 0.1)); }}><Plus size={16} /></button><button className={`text-button ${zoom === null ? 'fit-active' : ''}`} onClick={() => { setZoom(null); }} aria-label="Fit preview to width">Fit</button></div><div className="preview-file-actions"><button className="text-button pdf-trigger" aria-label="PDF preview" title="PDF preview" onClick={() => setModal('pdf')}><Eye size={17} /><span>PDF preview</span></button><button className="icon-button desktop-only" aria-label={previewFocused ? 'Exit focus preview' : 'Focus preview'} title={previewFocused ? 'Return to editor' : 'Focus preview'} onClick={() => { setDesignOpen(false); setPreviewFocused(!previewFocused); setMobile('preview'); }}>{previewFocused ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div></footer></section>
      </main>
    </>}
    {modal === 'library' && <Modal title="My resumes" onClose={() => { setModal(null); setDeleting(null); }}><div className="library-intro"><p>A workspace for every next step.</p><button className="primary-button" onClick={newResume}><Plus size={16} />New resume</button></div><div className="resume-library">{s.profiles.map(p => <div key={p.profileId} className={`library-card ${s.activeProfileId === p.profileId ? 'selected' : ''}`}><FileText size={24} /><button className="library-open" onClick={() => { s.setActiveProfile(p.profileId); setModal(null); selectSection('personal'); }}><strong>{p.profileName || 'Untitled resume'}</strong><span>{fullName(p) || 'Add your personal details'}{s.activeProfileId === p.profileId ? ' · Current document' : ''}</span></button><button className="icon-button" aria-label={`Duplicate ${p.profileName}`} onClick={() => { s.cloneProfile(p.profileId, `${p.profileName} (Copy)`); setToast('Resume duplicated.'); }}><Copy size={17} /></button><button className="icon-button danger-text" aria-label={`Delete ${p.profileName}`} onClick={() => setDeleting(p.profileId)}><Trash2 size={17} /></button>{deleting === p.profileId && <div className="delete-confirm"><p>Delete this resume from this browser? This cannot be undone.</p><button className="secondary-button" onClick={() => setDeleting(null)}>Keep resume</button><button className="danger-button" onClick={() => { s.deleteProfile(p.profileId); setDeleting(null); }}>Delete resume</button></div>}</div>)}{!s.profiles.length && <p className="subtle-note">No resumes yet. Start with a blank document or try the demo.</p>}</div><div className="library-bottom"><button className="text-button" onClick={() => { s.loadSampleProfile(); setModal(null); selectSection('personal'); setToast('Demo resume loaded. Replace the sample information with your own.'); }}><FileText size={16} />Try a demo resume</button></div><p className="library-privacy"><HardDrive size={14} />Stored in this browser, not in a cloud account. Clearing browser data can remove your resumes.</p></Modal>}
    {modal === 'export' && profile && <Modal title="Ready for your next chapter?" onClose={() => setModal(null)}><div className="export-dialog"><div className="export-art"><FileText size={42} /><CheckCircle2 size={22} /></div><h3>A polished resume. A portable PDF.</h3><p>Export your <strong>{selectedTemplate}</strong> template on A4 paper, with selectable text and no watermark.</p><div className="export-checklist">{checklist.map(x => <div key={x.label}>{x.done ? <CheckCircle2 size={16} /> : <Info size={16} />}<span>{x.label}</span><small>{x.done ? 'Included' : 'Not added'}</small></div>)}</div><p className="subtle-note">Optional sections can stay empty. This is a content checklist, not a guarantee of job or ATS outcomes. Latin-script PDF export in this release.</p><button className="primary-button export-main" disabled={exporting} onClick={() => void exportPDF()}>{exporting ? <Loader2 className="spin" size={18} /> : <Download size={18} />}{exporting ? 'Preparing PDF…' : 'Download PDF'}</button><div className="export-secondary"><button className="text-button" onClick={() => setModal('pdf')}><Eye size={16} />Inspect PDF first</button></div></div></Modal>}
    {modal === 'pdf' && profile && <Modal title="PDF preview · Final page breaks" wide onClose={() => setModal(null)}><div className="pdf-preview-note"><Info size={16} />Preview of the file you will download. Latin-script fonts in this release.<button className="text-button" disabled={exporting} onClick={() => void exportPDF()}><Download size={16} />Download</button></div><Suspense fallback={<div className="pdf-loading"><Loader2 className="spin" size={24} />Preparing your PDF…</div>}>{unsupportedPDF ? <div className="pdf-loading">Non-Latin PDF export needs dedicated fonts and shaping. Your content is kept in this browser.</div> : <PDFInspection profile={profile} theme={s.documentTheme} />}</Suspense></Modal>}
    {toast && <div className="builder-toast" role="status"><Info size={18} /><span>{toast}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16} /></button></div>}
  </div>;
}
