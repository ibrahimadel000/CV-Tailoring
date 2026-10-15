import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, ArrowUpRight, Maximize2, Minimize2, ListOrdered, ChevronsLeft, ChevronsRight, Check, Download, Plus, Copy, Trash2, X, Upload, FolderOpen, CheckCircle2, LayoutTemplate, SlidersHorizontal, Eye, ArrowLeft, ArrowRight, Minus, Info, AlertCircle, Loader2, PanelLeft, UserRound, AlignLeft, BriefcaseBusiness, GraduationCap, Wrench, Layers, Award, PencilLine, HardDrive } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useAppStore } from '@/store/useAppStore';
import { cvProfileSchema } from '@/types/schema';
import { SectionEditor } from './SectionEditor';
import { CustomSectionEditor } from './CustomSectionEditor';
import { SectionManager } from './SectionManager';
import { ResumePaper } from './ResumePaper';
import { DesignPanel } from './DesignPanel';
import { essentials, fullName, hasUnsupportedPDFText, sectionCount, sections, orderedSections, resumeBlocks, type SectionId, type BuiltInSectionId } from './resumeModel';
import { useBuilderPersistence } from './useBuilderPersistence';
const PDFInspection = lazy(() => import('./PDFInspection'));
const icons = { personal: UserRound, summary: AlignLeft, experience: BriefcaseBusiness, education: GraduationCap, skills: Wrench, projects: Layers, certifications: Award };
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
  const [tab, setTab] = useState<'content' | 'design'>('content');
  const [mobile, setMobile] = useState<'edit' | 'preview'>('edit');
  const [modal, setModal] = useState<'library' | 'pdf' | 'export' | 'sections' | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [exporting, setExporting] = useState(false);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [previewFocused, setPreviewFocused] = useState(false);
  const [followSection, setFollowSection] = useState(true);
  const [fitMode, setFitMode] = useState<'width' | 'overview'>('width');
  const [stageHeight, setStageHeight] = useState(700);
  const [zoom, setZoom] = useState<number | null>(null);
  const [stageWidth, setStageWidth] = useState(700);
  const [paperHeight, setPaperHeight] = useState(1123);
  const stage = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const profile = s.profiles.find(p => p.profileId === s.activeProfileId);
  const list = profile ? orderedSections(profile) : sections;
  const current = list.find(x => x.id === section) || list[0];
  const currentIndex = Math.max(0, list.findIndex(x => x.id === section));
  const hasPreviewSection = profile ? (section === 'personal' || resumeBlocks(profile).some(b => b.id === section)) : false;
  const checklist = profile ? essentials(profile) : [];
  const completed = checklist.filter(x => x.done).length;
  const fitWidth = Math.min(1, Math.max(0.2, (stageWidth - 48) / 794));
  const scale = zoom ?? (fitMode === 'overview' ? Math.min(fitWidth, Math.max(0.1, (stageHeight - 60) / paperHeight)) : fitWidth);
  const unsupportedPDF = profile ? hasUnsupportedPDFText(profile) : false;
  const selectedTemplate = ({ modern: 'Essential', classic: 'Editorial', minimal: 'Compact', split: 'Essential' })[s.documentTheme.layoutStyle];
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 6500); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => { editor.current?.scrollTo({ top: 0 }); }, [section, tab, s.activeProfileId]);
  useLayoutEffect(() => {
    const a = stage.current; const b = paper.current;
    if (!a || !b) return;
    const measure = () => { if (a.clientWidth > 0 && a.clientHeight > 0 && b.scrollHeight > 0) { setStageWidth(a.clientWidth); setStageHeight(a.clientHeight); setPaperHeight(b.scrollHeight); } };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(a); observer.observe(b);
    return () => observer.disconnect();
  }, [ready, profile?.profileId, mobile]);
  useEffect(() => { setSection('personal'); }, [profile?.profileId]);
  useEffect(() => {
    if (!followSection || fitMode === 'overview' || tab !== 'content' || !hasPreviewSection) return;
    const frame = requestAnimationFrame(() => {
      const container = stage.current;
      const target = paper.current?.querySelector<HTMLElement>(`[data-resume-section="${section}"]`);
      if (container && target) container.scrollTo({ top: Math.max(0, container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 24), behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [section, followSection, fitMode, tab, hasPreviewSection, scale, mobile]);
  const selectSection = (id: SectionId) => { setSection(id); setTab('content'); setMobile('edit'); setEditorCollapsed(false); setPreviewFocused(false); };
  const newResume = () => { s.createProfile('Untitled resume'); setModal(null); selectSection('personal'); };
  const backup = () => {
    if (!profile) return;
    download(new Blob([JSON.stringify({ format: 'cv-builder-backup', version: 1, profile, theme: s.documentTheme }, null, 2)], { type: 'application/json' }), `${safeName(profile.profileName)}.json`);
    setToast('JSON backup downloaded. Keep it private: it contains your resume data.');
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Choose a JSON backup smaller than 5 MB.');
      const data = JSON.parse(await file.text());
      if (data.format !== 'cv-builder-backup' || data.version !== 1) throw new Error('Choose a JSON backup exported by this builder.');
      const parsed = cvProfileSchema.safeParse(data.profile);
      if (!parsed.success) throw new Error('The backup does not contain a valid resume. Your existing resumes are unchanged.');
      const imported = { ...parsed.data, profileId: uuid(), profileName: `${parsed.data.profileName} (Imported)` };
      // Import as a new document, never overwrite a current resume or its theme.
      useAppStore.setState(state => ({ profiles: [...state.profiles, imported], activeProfileId: imported.profileId }));
      setModal(null); selectSection('personal'); setToast('Resume imported as a new document.');
    } catch (e) { setToast(e instanceof Error ? e.message : 'Could not import this backup.'); }
    finally { if (importInput.current) importInput.current.value = ''; }
  };
  const exportPDF = async () => {
    if (!profile || exporting) return;
    if (!fullName(profile)) { setModal(null); selectSection('personal'); setToast('Add your name before exporting your resume.'); return; }
    // The built-in PDF fonts do not support Arabic/CJK. Never silently emit missing glyphs.
    if (unsupportedPDF) { setModal(null); setToast('This release uses Latin PDF fonts. Arabic and other non-Latin PDF export needs a dedicated font/shaping pass; your content is saved and can be backed up as JSON.'); return; }
    setExporting(true);
    try {
      const [{ pdf }, { BuilderPDF }] = await Promise.all([import('@react-pdf/renderer'), import('./BuilderPDF')]);
      const blob = await pdf(<BuilderPDF profile={profile} theme={s.documentTheme} />).toBlob();
      download(blob, `${safeName(fullName(profile) || profile.profileName)}_Resume.pdf`);
      setToast('Your PDF is ready. Check the final page breaks before sending it.');
      setModal(null);
    } catch { setModal(null); setToast('Could not generate the PDF. Your resume is unchanged. Try again or download a JSON backup.'); }
    finally { setExporting(false); }
  };
  if (!ready) return <div className="builder-loading"><div className="brand"><span className="brand-mark"><FileText size={22} /></span>folio<span className="brand-dot">.</span></div>{status === 'error' ? <><AlertCircle size={24} /><h1>We couldn’t open your workspace.</h1><p>{message}</p><button className="primary-button" onClick={() => window.location.reload()}>Reload and retry</button></> : <><Loader2 className="spin" size={24} /><p>Opening your workspace…</p></>}</div>;
  return <div className="builder-app">
    <header className="studio-topbar compact-header">
      <button className="brand" onClick={() => setModal('library')} aria-label="Folio resume library"><span className="brand-mark"><FileText size={18} /></span>folio<span className="brand-dot">.</span></button>
      <div className="compact-document">{profile ? <input className="document-title" aria-label="Resume document name" value={profile.profileName} maxLength={100} onChange={e => s.updateProfileName(profile.profileId, e.target.value)} onBlur={e => { if (!e.target.value.trim()) s.updateProfileName(profile.profileId, 'Untitled resume'); }} /> : <strong>Your resume workspace</strong>}<div className={`save-state ${status === 'error' ? 'save-error' : ''}`} role="status">{status === 'saved' ? <CheckCircle2 size={12} /> : status === 'saving' ? <Loader2 size={12} className="spin" /> : <AlertCircle size={12} />}<span>{status === 'saved' ? 'All changes saved on this device' : status === 'saving' ? 'Saving changes…' : 'Changes are not saved'}</span>{status === 'error' && <button onClick={retrySave}>Retry</button>}</div></div>
      <div className="topbar-actions"><button className="text-button header-backup desktop-only" disabled={!profile} onClick={backup} title="Download a JSON backup"><Download size={15} /><span>Backup</span></button><button className="secondary-button library-button" onClick={() => setModal('library')}><FolderOpen size={16} /><span>My resumes</span></button><button className="primary-button" disabled={!profile || exporting} onClick={() => setModal('export')}>{exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}<span>Export PDF</span></button></div>
    </header>
    {message && <div className="storage-warning" role="alert"><AlertCircle size={16} />{message}</div>}
    {!profile ? <main className="no-resumes"><span className="empty-plus"><FileText size={30} /></span><span className="eyebrow">A FRESH START</span><h1>Your next chapter starts here.</h1><p>Build a clear, thoughtful resume. One section at a time.</p><button className="primary-button" onClick={newResume}><Plus size={18} />Create a resume</button><button className="text-button" onClick={() => importInput.current?.click()}>Import a JSON backup</button></main> : <>
      <div className="mobile-workspace-tabs"><button className={mobile === 'edit' ? 'active' : ''} onClick={() => setMobile('edit')}><PencilLine size={16} /> Edit resume</button><button className={mobile === 'preview' ? 'active' : ''} onClick={() => setMobile('preview')}><Eye size={16} /> Live preview</button></div>
      <main className={`studio-workspace mobile-${mobile} ${editorCollapsed ? 'editor-collapsed' : ''} ${previewFocused ? 'preview-focused' : ''}`}>
        <aside className="section-rail" aria-label="Resume sections"><div className="rail-heading"><span className="eyebrow">YOUR RESUME</span><span className="rail-step">{currentIndex + 1} / {list.length}</span></div><nav>{list.map(x => { const Icon = icons[x.id as BuiltInSectionId] || FileText; const count = sectionCount(profile, x.id); return <button key={x.id} className={`section-link ${section === x.id && tab === 'content' ? 'active' : ''}`} aria-current={section === x.id && tab === 'content' ? 'step' : undefined} onClick={() => selectSection(x.id)}><Icon size={17} /><span>{x.title}</span>{count > 0 ? <Check size={13} className="section-done" /> : <span className="section-empty" />}</button>; })}</nav><button className={`rail-design ${tab === 'design' ? 'active' : ''}`} onClick={() => { setTab('design'); setMobile('edit'); }}><SlidersHorizontal size={17} /> Design & template <ArrowUpRight size={15} /></button><button className="rail-manage" onClick={() => setModal('sections')}><ListOrdered size={17} />Arrange sections</button><button className="rail-add" onClick={() => setModal('sections')}><Plus size={17} />Add custom section</button><div className="resume-readiness"><span className="eyebrow">THE ESSENTIALS</span><div><strong>{completed}<span> / 5</span></strong><span>included</span></div><progress max={5} value={completed} aria-label={`${completed} of 5 resume essentials included`} /><p>A checklist, not an ATS score.</p><ul>{checklist.map(x => <li key={x.label} className={x.done ? 'done' : ''}>{x.done ? <CheckCircle2 size={13} /> : <span className="checklist-dot" />}{x.label}</li>)}</ul></div><div className="rail-footer"><span className="privacy-dot" />Your story stays yours.<small>No account needed. No AI requests.</small></div></aside>
        <section className="editor-pane" aria-label="Resume editor"><div className="editor-tabs"><button className={tab === 'content' ? 'active' : ''} onClick={() => setTab('content')}><PanelLeft size={16} />Content</button><button className={tab === 'design' ? 'active' : ''} onClick={() => setTab('design')}><LayoutTemplate size={16} />Design</button><button className="icon-button editor-manage-button" aria-label="Arrange and add sections" onClick={() => setModal('sections')} title="Arrange and add sections"><ListOrdered size={17} /></button><span className="editor-tab-count">{tab === 'content' ? 'STEP ' + (currentIndex + 1) : 'YOUR STYLE'}</span></div><div className="mobile-section-select">{tab === 'content' && <label>Section<select aria-label="Choose resume section" value={section} onChange={e => selectSection(e.target.value as SectionId)}>{list.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>}</div><div className="editor-scroll" ref={editor}>{tab === 'design' ? <DesignPanel /> : <><div className="section-intro"><span className="eyebrow">{String(currentIndex + 1).padStart(2, '0')} / BUILD YOUR STORY</span><h2>{current.title}</h2><p>{current.description}</p></div>{section.startsWith('custom:') ? <CustomSectionEditor key={`${profile.profileId}-${section}`} profile={profile} section={section} /> : <SectionEditor key={`${profile.profileId}-${section}`} profile={profile} section={section as BuiltInSectionId} />}<div className="editor-tip"><Info size={17} /><p>{current.hint}</p></div></>}</div><footer className="editor-step-footer">{tab === 'content' ? <><button className="text-button" disabled={currentIndex === 0} onClick={() => selectSection(list[currentIndex - 1].id)}><ArrowLeft size={16} />Back</button><span>{currentIndex + 1} of {list.length} sections</span><button className="text-button next-step" onClick={() => currentIndex === list.length - 1 ? setTab('design') : selectSection(list[currentIndex + 1].id)}>{currentIndex === list.length - 1 ? 'Choose design' : 'Next section'}<ArrowRight size={16} /></button></> : <><button className="text-button" onClick={() => setTab('content')}><ArrowLeft size={16} />Back to content</button><button className="text-button next-step" onClick={() => setModal('export')}>Export PDF<ArrowRight size={16} /></button></>}</footer></section>
        <section className="preview-pane" aria-label="Resume preview workspace"><header className="preview-heading"><div><span className="live-dot" /><strong>Live preview</strong><span className="paper-size">A4 · {selectedTemplate}</span></div><div className="preview-actions"><button className="icon-button desktop-only" aria-label={editorCollapsed ? 'Expand editor' : 'Collapse editor'} title={editorCollapsed ? 'Show editor' : 'More room for preview'} onClick={() => { setEditorCollapsed(!editorCollapsed); setPreviewFocused(false); }}>{editorCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}</button><button className="icon-button" aria-label={previewFocused ? 'Exit focus preview' : 'Focus preview'} title={previewFocused ? 'Back to workspace' : 'Focus on your resume'} onClick={() => { setPreviewFocused(!previewFocused); setMobile('preview'); }}>{previewFocused ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div></header><div className="preview-stage" ref={stage}><div className="scaled-paper" style={{ width: 794 * scale, height: paperHeight * scale }}><div ref={paper} style={{ width: 794, transform: `scale(${scale})`, transformOrigin: 'top left' }}><ResumePaper profile={profile} theme={s.documentTheme} onEdit={selectSection} /></div></div><p className="preview-footnote">Continuous preview · PDF preview shows final page breaks</p></div><footer className="preview-toolbar"><div className="zoom-controls"><button className="icon-button" aria-label="Zoom out" onClick={() => { setFitMode('width'); setZoom(Math.max(0.15, scale - 0.1)); }}><Minus size={16} /></button><span>{Math.round(scale * 100)}%</span><button className="icon-button" aria-label="Zoom in" onClick={() => { setFitMode('width'); setZoom(Math.min(1.4, scale + 0.1)); }}><Plus size={16} /></button><button className={`text-button ${zoom === null && fitMode === 'width' ? 'fit-active' : ''}`} onClick={() => { setZoom(null); setFitMode('width'); }}>Fit width</button><button className={`text-button ${zoom === null && fitMode === 'overview' ? 'fit-active' : ''}`} onClick={() => { setZoom(null); setFitMode('overview'); stage.current?.scrollTo({ top: 0 }); }}>Overview</button></div><div className="preview-follow"><button className="text-button follow-toggle" aria-pressed={followSection} onClick={() => setFollowSection(!followSection)} title="Automatically show the section you are editing">{followSection ? <Check size={14} /> : <Eye size={14} />}Follow edit</button><button className="text-button" onClick={() => setModal('pdf')}><Eye size={16} />PDF preview</button></div></footer></section>
      </main>
    </>}
    <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={e => void importBackup(e.target.files?.[0])} />
    {modal === 'sections' && profile && <Modal title="Arrange & add sections" onClose={() => setModal(null)}><SectionManager profile={profile} onEdit={id => { setModal(null); selectSection(id); }} onDelete={id => { if (section === id) selectSection('personal'); }} /></Modal>}
    {modal === 'library' && <Modal title="My resumes" onClose={() => { setModal(null); setDeleting(null); }}><div className="library-intro"><p>A workspace for every next step.</p><button className="primary-button" onClick={newResume}><Plus size={16} />New resume</button></div><div className="resume-library">{s.profiles.map(p => <div key={p.profileId} className={`library-card ${s.activeProfileId === p.profileId ? 'selected' : ''}`}><FileText size={24} /><button className="library-open" onClick={() => { s.setActiveProfile(p.profileId); setModal(null); selectSection('personal'); }}><strong>{p.profileName || 'Untitled resume'}</strong><span>{fullName(p) || 'Add your personal details'}{s.activeProfileId === p.profileId ? ' · Current document' : ''}</span></button><button className="icon-button" aria-label={`Duplicate ${p.profileName}`} onClick={() => { s.cloneProfile(p.profileId, `${p.profileName} (Copy)`); setToast('Resume duplicated.'); }}><Copy size={17} /></button><button className="icon-button danger-text" aria-label={`Delete ${p.profileName}`} onClick={() => setDeleting(p.profileId)}><Trash2 size={17} /></button>{deleting === p.profileId && <div className="delete-confirm"><p>Delete this resume from this device? Download a backup first if you need it.</p><button className="secondary-button" onClick={() => setDeleting(null)}>Keep resume</button><button className="danger-button" onClick={() => { s.deleteProfile(p.profileId); setDeleting(null); }}>Delete resume</button></div>}</div>)}{!s.profiles.length && <p className="subtle-note">No resumes yet. Start with a blank document or import a backup.</p>}</div><div className="library-bottom"><button className="text-button" onClick={() => { s.loadSampleProfile(); setModal(null); selectSection('personal'); setToast('Demo resume loaded. Replace the sample information with your own.'); }}><FileText size={16} />Try a demo resume</button><button className="text-button" onClick={() => importInput.current?.click()}><Upload size={16} />Import JSON backup</button></div><p className="library-privacy"><HardDrive size={14} />Stored in this browser. Clearing browser data can remove resumes; keep backups.</p></Modal>}
    {modal === 'export' && profile && <Modal title="Ready for your next chapter?" onClose={() => setModal(null)}><div className="export-dialog"><div className="export-art"><FileText size={42} /><CheckCircle2 size={22} /></div><h3>A polished resume. A portable PDF.</h3><p>Export your <strong>{selectedTemplate}</strong> template on A4 paper, with selectable text and no watermark.</p><div className="export-checklist">{checklist.map(x => <div key={x.label}>{x.done ? <CheckCircle2 size={16} /> : <Info size={16} />}<span>{x.label}</span><small>{x.done ? 'Included' : 'Not added'}</small></div>)}</div><p className="subtle-note">Optional sections can stay empty. This is a content checklist, not a guarantee of job or ATS outcomes. Latin-script PDF export in this release.</p><button className="primary-button export-main" disabled={exporting} onClick={() => void exportPDF()}>{exporting ? <Loader2 className="spin" size={18} /> : <Download size={18} />}{exporting ? 'Preparing PDF…' : 'Download PDF'}</button><div className="export-secondary"><button className="text-button" onClick={() => setModal('pdf')}><Eye size={16} />Inspect PDF first</button><button className="text-button" onClick={backup}><Download size={16} />Save JSON backup</button></div></div></Modal>}
    {modal === 'pdf' && profile && <Modal title="PDF preview · Final page breaks" wide onClose={() => setModal(null)}><div className="pdf-preview-note"><Info size={16} />Preview of the file you will download. Latin-script fonts in this release.<button className="text-button" disabled={exporting} onClick={() => void exportPDF()}><Download size={16} />Download</button></div><Suspense fallback={<div className="pdf-loading"><Loader2 className="spin" size={24} />Preparing your PDF…</div>}>{unsupportedPDF ? <div className="pdf-loading">Non-Latin PDF export needs dedicated fonts and shaping. Your content is saved; use JSON backup for now.</div> : <PDFInspection profile={profile} theme={s.documentTheme} />}</Suspense></Modal>}
    {toast && <div className="builder-toast" role="status"><Info size={18} /><span>{toast}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16} /></button></div>}
  </div>;
}
