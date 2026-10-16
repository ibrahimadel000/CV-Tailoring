import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertCircle, FileText, Loader2 } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { fullName, hasUnsupportedPDFText, resumeBlocks, type SectionId } from './resumeModel';
import { ResumePaper } from './ResumePaper';
import { useResumePDF } from './pdfPipeline';
GlobalWorkerOptions.workerSrc = workerUrl;
const WIDTH = 794;
type Anchor = { id: SectionId; title: string; page: number; top: number; left: number };
type Loaded = { pdf: PDFDocumentProxy; key: string; height: number; anchors: Anchor[] };

function PDFPage({ document, number, scale, anchors, root, onEdit }: { document: Loaded; number: number; scale: number; anchors: Anchor[]; root: HTMLDivElement | null; onEdit: (id: SectionId) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(number === 1);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!node.current) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root, rootMargin: '600px 0px' });
    observer.observe(node.current); return () => observer.disconnect();
  }, [root]);
  useEffect(() => {
    const surface = canvas.current; const layerNode = text.current;
    if (!near || !surface || !layerNode) return;
    let live = true; let render: RenderTask | undefined; let layer: TextLayer | undefined;
    surface.dataset.ready = 'false'; setFailed(false);
    void (async () => {
      const page = await document.pdf.getPage(number);
      if (!live) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: WIDTH / base.width * scale });
      const ratio = 2;
      surface.width = Math.ceil(viewport.width * ratio); surface.height = Math.ceil(viewport.height * ratio);
      const context = surface.getContext('2d'); if (!context) throw new Error('Canvas unavailable');
      render = page.render({ canvasContext: context, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await render.promise;
      if (!live) return;
      layerNode.replaceChildren();
      layerNode.style.setProperty('--scale-factor', String(viewport.scale));
      layer = new TextLayer({ textContentSource: await page.getTextContent(), container: layerNode, viewport });
      if (!live) return;
      await layer.render();
      if (live) surface.dataset.ready = 'true';
    })().catch(() => { if (live) setFailed(true); });
    return () => { live = false; render?.cancel(); layer?.cancel(); layerNode.replaceChildren(); };
  }, [document.pdf, number, scale, near, retry]);
  return <figure className="pdf-preview-page" data-page-number={number} style={{ width: WIDTH * scale }}>
    <div ref={node} className="pdf-page-surface" style={{ width: WIDTH * scale, height: document.height * scale }}>
      <canvas ref={canvas} aria-hidden="true" style={{ width: '100%', height: '100%' }} />
      <div ref={text} className="pdf-text-layer" aria-label={`Page ${number} text`} />
      {anchors.map(anchor => <button key={anchor.id} data-resume-section={anchor.id} className="pdf-section-edit" aria-label={anchor.id === 'personal' ? 'Edit personal details from preview' : `Edit ${anchor.title} from preview`} title={`Edit ${anchor.title}`} onClick={() => onEdit(anchor.id)} style={{ top: anchor.top * scale, left: anchor.left * scale, width: (WIDTH - anchor.left * 2) * scale, height: (anchor.id === 'personal' ? 36 : 20) * scale }} />)}
      {failed && <div className="pdf-page-error"><AlertCircle size={20} /><p>This page could not be displayed.</p><button className="secondary-button" onClick={() => setRetry(x => x + 1)}>Retry page</button></div>}
    </div>
    <figcaption>Page {number} of {document.pdf.numPages}</figcaption>
  </figure>;
}
function Unpaginated({ profile, theme, scale, onEdit }: { profile: CVProfile; theme: DocumentTheme; scale: number; onEdit: (id: SectionId) => void }) {
  const ref = useRef<HTMLDivElement>(null); const [height, setHeight] = useState(1123);
  useLayoutEffect(() => { if (!ref.current) return; const observer = new ResizeObserver(() => { if (ref.current?.scrollHeight) setHeight(ref.current.scrollHeight); }); observer.observe(ref.current); return () => observer.disconnect(); }, []);
  return <div className="scaled-paper unpaginated-paper" style={{ width: WIDTH * scale, height: height * scale }}><div ref={ref} style={{ width: WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}><ResumePaper profile={profile} theme={theme} onEdit={onEdit} /></div></div>;
}
export default function PaginatedPreview({ profile, theme, scale, section, visible, onWidth, onEdit }: { profile: CVProfile; theme: DocumentTheme; scale: number; section: SectionId; visible: boolean; onWidth: (width: number) => void; onEdit: (id: SectionId) => void }) {
  const unsupported = hasUnsupportedPDFText(profile);
  const result = useResumePDF(profile, theme, !unsupported);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [parseError, setParseError] = useState(false);
  const [parseRetry, setParseRetry] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const previousScale = useRef(scale);
  const current = result.current && loaded?.key === result.currentKey;
  useLayoutEffect(() => {
    const element = stage.current; if (!element) return;
    const measure = () => { if (element.clientWidth > 0) onWidth(element.clientWidth); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, [onWidth]);
  useEffect(() => {
    if (!result.blob || unsupported) return;
    let live = true; let task: ReturnType<typeof getDocument> | undefined; let published = false;
    setParseError(false);
    void (async () => {
      const data = await result.blob!.arrayBuffer();
      if (!live) return;
      task = getDocument({ data, useSystemFonts: true, isEvalSupported: false });
      const pdf = await task.promise;
      const first = await pdf.getPage(1); const viewport = first.getViewport({ scale: 1 });
      const ratio = WIDTH / viewport.width;
      // Locate headings in the actual laid-out PDF text, never estimate HTML heights.
      // Nested react-pdf named destinations have parent-relative Y coordinates,
      // so text coordinates are safer (including sections split across pages).
      const anchors: Anchor[] = [];
      const headings = [{ id: 'personal' as SectionId, title: 'personal details', text: fullName(profile) || 'Your name' }, ...resumeBlocks(profile).map(b => ({ id: b.id, title: b.title, text: b.title.toUpperCase() }))];
      let nextHeading = 0;
      const compact = (value: string) => value.replace(/\s/g, '');
      for (let pageNumber = 1; pageNumber <= pdf.numPages && nextHeading < headings.length; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const items = content.items.filter(item => 'str' in item && item.str.trim());
        for (let i = 0; i < items.length && nextHeading < headings.length; i++) {
          const item = items[i]; if (!('str' in item)) continue;
          const target = compact(headings[nextHeading].text); let found = '';
          for (let j = i; j < Math.min(items.length, i + 12); j++) {
            const part = items[j]; if (!('str' in part)) continue;
            found += compact(part.str);
            if (!target.startsWith(found)) break;
            if (found === target) {
              const heading = headings[nextHeading++];
              anchors.push({ id: heading.id, title: heading.title, page: pageNumber, top: Math.max(0, (viewport.height - item.transform[5] - item.height) * ratio), left: item.transform[4] * ratio });
              i = j; break;
            }
          }
        }
      }
      if (!live) { await task.destroy(); return; }
      published = true; setLoaded({ pdf, key: result.key, height: viewport.height * ratio, anchors });
    })().catch(() => { if (live) setParseError(true); });
    return () => { live = false; if (!published) void task?.destroy(); };
  }, [result.blob, result.key, unsupported, parseRetry]);
  useEffect(() => () => { if (loaded) void loaded.pdf.destroy(); }, [loaded]);
  useLayoutEffect(() => {
    if (stage.current && previousScale.current !== scale) stage.current.scrollTop *= scale / previousScale.current;
    previousScale.current = scale;
  }, [scale]);
  useEffect(() => { follow.current = true; }, [section, visible]);
  useEffect(() => {
    if (!loaded || !follow.current) return;
    const anchor = loaded.anchors.find(a => a.id === section); if (!anchor) return;
    const frame = requestAnimationFrame(() => {
      const container = stage.current; const page = container?.querySelector<HTMLElement>(`[data-page-number="${anchor.page}"]`);
      if (container && page && container.clientHeight) { container.scrollTop = Math.max(0, container.scrollTop + page.getBoundingClientRect().top - container.getBoundingClientRect().top + anchor.top * scale - 24); follow.current = false; }
    });
    return () => cancelAnimationFrame(frame);
  }, [section, visible, loaded, scale]);
  const failed = result.error || parseError;
  return <>
    <div className={`pagination-status ${failed || unsupported ? 'pagination-warning' : ''}`} aria-live="polite" aria-atomic="true" data-pagination-current={current && !failed ? 'true' : 'false'}>
      {unsupported ? <><AlertCircle size={15} /><span>Unpaginated · PDF fonts support Latin script only</span></> : failed ? <><AlertCircle size={15} /><span>Couldn’t update pages</span><button className="text-button" onClick={() => { setParseRetry(x => x + 1); result.retry(); }}>Retry</button></> : <><FileText size={15} /><strong>{current && loaded ? `${loaded.pdf.numPages} ${loaded.pdf.numPages === 1 ? 'page' : 'pages'} · A4` : loaded ? 'Updating page count…' : 'Preparing pages…'}</strong><span className="pagination-detail">{current ? 'Matches your PDF' : <><Loader2 size={13} className="spin" />Updating preview</>}</span></>}
    </div>
    <div ref={stage} className={`preview-stage paginated-stage ${!current && loaded && !unsupported ? 'preview-is-updating' : ''}`} aria-label="Paginated resume preview" aria-busy={!current && !unsupported && !failed}>
      {unsupported ? <><p className="pagination-fallback-note">Your text is kept. Accurate page breaks need PDF fonts for this script; this is a continuous preview.</p><Unpaginated profile={profile} theme={theme} scale={scale} onEdit={onEdit} /></> : loaded ? Array.from({ length: loaded.pdf.numPages }, (_, i) => <PDFPage key={`${loaded.key}-${i}`} document={loaded} number={i + 1} scale={scale} anchors={loaded.anchors.filter(a => a.page === i + 1)} root={stage.current} onEdit={onEdit} />) : <div className="page-preview-placeholder" style={{ width: WIDTH * scale, height: 1123 * scale } as CSSProperties}>{failed ? <AlertCircle size={24} /> : <Loader2 size={24} className="spin" />}<p>{failed ? 'Preview unavailable. Retry above or open PDF preview.' : 'Preparing your A4 pages…'}</p></div>}
    </div>
  </>;
}
