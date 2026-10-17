import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { Camera, Check, ImagePlus, RotateCcw, Trash2, X } from 'lucide-react';
import type { ResumeHeader } from '@/types/schema';
import { paintPhoto, readPhoto, storedPhoto, type PhotoDraft } from './photoModel';

export function PhotoField({ header, onChange }: { header: ResumeHeader; onChange: (change: Partial<ResumeHeader>) => void }) {
  const id = useId(); const input = useRef<HTMLInputElement>(null); const action = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null); const crop = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const live = useRef(true); const revision = useRef(0); const resource = useRef<PhotoDraft | null>(null);
  const gesture = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(null);
  const [draft, setDraft] = useState<PhotoDraft | null>(null); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [zoom, setZoom] = useState(1); const [x, setX] = useState(50); const [y, setY] = useState(50);
  const source = storedPhoto(header); const shape = header.photoShape ?? 'circle';
  useEffect(() => { live.current = true; return () => { live.current = false; revision.current++; resource.current?.dispose(); resource.current = null; }; }, []);
  useLayoutEffect(() => {
    if (!draft || !canvas.current) return;
    try { paintPhoto(canvas.current, draft, zoom, x, y); } catch (e) { setError((e as Error).message); }
  }, [draft, zoom, x, y]);
  useLayoutEffect(() => { if (restoreFocus.current && action.current && !action.current.disabled) { restoreFocus.current = false; const button = action.current; const container = button.closest<HTMLElement>('.editor-scroll'); if (container) { const r = button.getBoundingClientRect(), c = container.getBoundingClientRect(); if (r.top < c.top + 12) container.scrollTop += r.top - c.top - 12; else if (r.bottom > c.bottom - 12) container.scrollTop += r.bottom - c.bottom + 12; } button.focus({ preventScroll: true }); } });
  const close = () => { restoreFocus.current = true; revision.current++; resource.current?.dispose(); resource.current = null; setDraft(null); setBusy(false); gesture.current = null; };
  const select = async (file?: File) => {
    if (!file) return;
    const request = ++revision.current; setBusy(true); setError(''); setNotice('');
    try {
      const next = await readPhoto(file);
      if (!live.current || request !== revision.current) { next.dispose(); return; }
      resource.current?.dispose(); resource.current = next; setDraft(next); setZoom(1); setX(50); setY(50);
      requestAnimationFrame(() => { if (live.current && request === revision.current) { crop.current?.scrollIntoView({ block: 'nearest' }); crop.current?.focus({ preventScroll: true }); } });
    } catch (e) { if (live.current && request === revision.current) setError((e as Error).message); }
    finally { if (live.current && request === revision.current) setBusy(false); }
  };
  const apply = () => {
    if (!draft || !canvas.current) return;
    try {
      paintPhoto(canvas.current, draft, zoom, x, y);
      const photoUrl = canvas.current.toDataURL('image/jpeg', 0.88);
      if (photoUrl.length > 500_000) throw new Error('This photo could not be compressed. Try another photo.');
      onChange({ photoUrl, showPhoto: true, photoShape: shape }); close(); setError(''); setNotice('Photo added to your resume.'); action.current?.focus({ preventScroll: true });
    } catch (e) { setError((e as Error).message); }
  };
  const drag = (e: PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current; if (!g || e.pointerId !== g.pointer || !draft) return;
    const box = e.currentTarget.getBoundingClientRect(); const size = Math.min(draft.width, draft.height) / zoom;
    const horizontal = draft.width - size, vertical = draft.height - size;
    setX(Math.max(0, Math.min(100, g.left - (e.clientX - g.x) / box.width * size / Math.max(1, horizontal) * 100)));
    setY(Math.max(0, Math.min(100, g.top - (e.clientY - g.y) / box.height * size / Math.max(1, vertical) * 100)));
  };
  return <div className="photo-field" role="group" aria-labelledby={`${id}-label`} aria-busy={busy}>
    <div className="photo-label-row"><h3 id={`${id}-label`}>Photo <span>(optional)</span></h3>{source && <label className="field-visibility"><input type="checkbox" role="switch" aria-label="Show photo on resume" checked={header.showPhoto !== false} onChange={e => { onChange({ showPhoto: e.target.checked }); setNotice(e.target.checked ? 'Photo shown on your resume.' : 'Photo hidden. Your photo is kept.'); }} /><span>{header.showPhoto !== false ? 'Show' : 'Hidden'}</span></label>}</div>
    <div className="photo-summary"><div className={`photo-thumbnail photo-${shape}`}>{source ? <img src={source} alt="Your resume photo" /> : <Camera size={28} aria-hidden="true" />}</div><div className="photo-summary-content"><div className="photo-actions"><button type="button" ref={action} className="secondary-button" disabled={busy || Boolean(draft)} onClick={() => input.current?.click()}><ImagePlus size={17} />{busy ? 'Reading photo…' : source ? 'Change photo' : 'Add photo'}</button>{source && !draft && <button type="button" className="text-button danger-text" onClick={() => { close(); onChange({ photoUrl: undefined, showPhoto: true }); setError(''); setNotice('Photo removed.'); action.current?.focus({ preventScroll: true }); }}><Trash2 size={16} />Remove photo</button>}</div><p id={`${id}-help`}>JPG, PNG or WebP · up to 5 MB. Choose a photo only if appropriate for your application.</p></div></div>
    <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Choose resume photo" aria-describedby={`${id}-help`} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void select(file); }} />
    {header.photoUrl && !source && <p className="photo-help">This older photo cannot be displayed. Choose a new JPG, PNG or WebP photo.</p>}
    {(source || draft) && <div className="photo-shape-label"><label htmlFor={`${id}-shape`}>Photo shape</label><select id={`${id}-shape`} value={shape} onChange={e => onChange({ photoShape: e.target.value as 'circle' | 'rounded' })}><option value="circle">Circle</option><option value="rounded">Rounded square</option></select></div>}
    {draft && <div className="photo-crop" ref={crop} tabIndex={-1} aria-label="Adjust your photo" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); close(); setError(''); action.current?.focus({ preventScroll: true }); } }}><div><h4>Adjust your photo</h4><p>Drag the photo or use the sliders. Only the cropped image is saved.</p></div><div className="photo-crop-layout"><canvas ref={canvas} width={400} height={400} className={`photo-crop-canvas photo-${shape}`} aria-label="Photo crop preview" onPointerDown={e => { if (e.button !== 0 || !e.isPrimary) return; gesture.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, left: x, top: y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={drag} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }} onLostPointerCapture={() => { gesture.current = null; }} /><div className="photo-sliders"><label htmlFor={`${id}-zoom`}>Zoom <output>{zoom.toFixed(1)}×</output></label><input id={`${id}-zoom`} type="range" min="1" max="3" step="0.05" value={zoom} onChange={e => setZoom(Number(e.target.value))} /><label htmlFor={`${id}-x`}>Horizontal position</label><input id={`${id}-x`} type="range" min="0" max="100" value={x} onChange={e => setX(Number(e.target.value))} disabled={draft.width === Math.min(draft.width, draft.height) / zoom} /><label htmlFor={`${id}-y`}>Vertical position</label><input id={`${id}-y`} type="range" min="0" max="100" value={y} onChange={e => setY(Number(e.target.value))} disabled={draft.height === Math.min(draft.width, draft.height) / zoom} /><button type="button" className="text-button" onClick={() => { setZoom(1); setX(50); setY(50); }}><RotateCcw size={15} />Reset crop</button></div></div><div className="photo-crop-actions"><button type="button" className="secondary-button" onClick={() => { close(); setError(''); action.current?.focus({ preventScroll: true }); }}><X size={16} />Cancel</button><button type="button" className="primary-button" onClick={apply}><Check size={16} />Use photo</button></div></div>}
    {error && <p className="photo-error" role="alert">{error}</p>}<span className="sr-only" role="status" aria-live="polite">{notice}</span>
  </div>;
}
