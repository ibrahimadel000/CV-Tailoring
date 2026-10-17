import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, Plus, Trash2 } from 'lucide-react';

type Visibility = { label: string; checked: boolean; onChange: (value: boolean) => void; text?: string };
export function CheckField({ label, checked, onChange }: Visibility) {
  return <label className="check-field"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span>{label}</span></label>;
}
export function GrowingTextarea({ value, className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = ref.current; if (!node) return;
    const fit = () => { node.style.height = 'auto'; node.style.height = `${Math.min(480, node.scrollHeight + 2)}px`; };
    fit(); let width = node.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => { const next = node.getBoundingClientRect().width; if (Math.abs(next - width) > 1) { width = next; fit(); } });
    observer.observe(node); return () => observer.disconnect();
  }, [value]);
  return <textarea {...props} ref={ref} className={`growing-textarea ${className}`} value={value} />;
}
export function Field({ label, value, onChange, placeholder, type = 'text', area = false, hint, visibility, autoComplete, disabled = false, error, ariaLabel, maxLength, onEnter }: { label: string; value?: string; onChange: (value: string) => void; placeholder?: string; type?: string; area?: boolean; hint?: string; visibility?: Visibility; autoComplete?: string; disabled?: boolean; error?: string; ariaLabel?: string; maxLength?: number; onEnter?: () => void }) {
  const id = useId(); const [touched, setTouched] = useState(false);
  const invalid = Boolean(error && touched);
  const common = { id, disabled, placeholder, autoComplete, maxLength, 'aria-label': ariaLabel, 'aria-invalid': invalid || undefined, 'aria-describedby': [hint ? `${id}-hint` : '', invalid ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined, onBlur: () => setTouched(true) };
  return <div className={`builder-field ${visibility?.checked === false ? 'field-not-shown' : ''} ${invalid ? 'field-is-invalid' : ''}`}>
    <div className="field-label-row"><label htmlFor={id}>{label}</label>{visibility && <label className="field-visibility" title={visibility.checked ? 'Included on your resume' : 'Hidden from your resume; your text is kept'}><input type="checkbox" role="switch" aria-label={visibility.label} checked={visibility.checked} onChange={e => visibility.onChange(e.target.checked)} /><span>{visibility.text || (visibility.checked ? 'Show' : 'Hidden')}</span></label>}</div>
    {area ? <GrowingTextarea {...common} value={value || ''} onChange={e => onChange(e.target.value)} rows={5} /> : <input {...common} type={type} value={value || ''} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (onEnter && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); onEnter(); } }} />}
    {hint && <small id={`${id}-hint`}>{hint}</small>}{invalid && <small id={`${id}-error`} className="field-error" role="status">{error}</small>}
  </div>;
}
export function OptionalAreaField({ label, addLabel, value, onChange }: { label: string; addLabel: string; value?: string; onChange: (value: string) => void }) {
  const [opened, setOpened] = useState(false); const root = useRef<HTMLDivElement>(null);
  return <div className="optional-area-field" ref={root}>{opened || value ? <Field label={label} value={value} onChange={onChange} area /> : <button className="text-button" onClick={() => { setOpened(true); requestAnimationFrame(() => root.current?.querySelector('textarea')?.focus()); }}><Plus size={16} />{addLabel}</button>}</div>;
}
export function FormSection({ title, children }: { title?: string; children: ReactNode }) {
  const id = useId();
  return <div className={`form-section ${title ? 'form-section-labelled' : ''}`} role="group" aria-labelledby={title ? id : undefined}>{title && <h3 id={id}>{title}</h3>}{children}</div>;
}
export function DateRangeFields({ start, end, onStart, onEnd, currentLabel = 'Ongoing', endLabel = 'End date' }: { start?: string; end?: string; onStart: (value: string) => void; onEnd: (value: string) => void; currentLabel?: string; endLabel?: string }) {
  const previousEnd = useRef(''); const ongoing = end === 'Present';
  return <div className="date-range-fields"><div className="form-grid"><Field label="Start date" value={start} onChange={onStart} placeholder="Jan 2023" autoComplete="off" /><Field label={endLabel} value={end} onChange={onEnd} placeholder="Jun 2025" autoComplete="off" disabled={ongoing} /></div><div className="date-current-row"><CheckField label={currentLabel} checked={ongoing} onChange={checked => { if (checked) { previousEnd.current = end || ''; onEnd('Present'); } else onEnd(previousEnd.current); }} /></div></div>;
}
const Editing = createContext<{ active: string | null; setActive: (id: string | null) => void } | null>(null);
export function EntryGroup({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  return <Editing.Provider value={{ active, setActive }}>{children}</Editing.Provider>;
}
export function EntryCard({ title, subtitle, layoutNote, children, onRemove, onUp, onDown, startOpen = false }: { title: string; subtitle?: string; layoutNote?: string; startOpen?: boolean; children: ReactNode; onRemove: () => void; onUp?: () => void; onDown?: () => void }) {
  const group = useContext(Editing);
  const [localOpen, setLocalOpen] = useState(startOpen);
  const [confirm, setConfirm] = useState(false);
  const id = useId();
  const form = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const open = group ? group.active === id : localOpen;
  const setOpen = (next: boolean) => { if (group) group.setActive(next ? id : null); else setLocalOpen(next); setConfirm(false); };
  useEffect(() => { if (startOpen) { if (group) group.setActive(id); const timer = setTimeout(() => form.current?.querySelector<HTMLInputElement>('input:not([type="checkbox"])')?.focus(), 0); return () => clearTimeout(timer); } }, []);
  const done = () => { setOpen(false); toggle.current?.focus({ preventScroll: true }); };
  return <div className={`entry-card ${open ? 'entry-is-editing' : ''}`}><div className="entry-heading"><button ref={toggle} className="entry-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}><span><strong>{title}</strong><small>{subtitle || 'Add the details for this entry'}</small>{layoutNote && <small className="entry-layout-note">{layoutNote}</small>}</span><span className="entry-edit-label">{open ? 'Editing' : 'Edit'}</span><ChevronDown size={17} style={{ transform: open ? 'rotate(180deg)' : '' }} /></button></div>{open && <div id={id} className="entry-form" ref={form}>{children}<div className="entry-form-footer"><div className="entry-secondary-actions"><button className="icon-button" aria-label={`Move ${title} up`} onClick={onUp} disabled={!onUp}><ArrowUp size={16} /></button><button className="icon-button" aria-label={`Move ${title} down`} onClick={onDown} disabled={!onDown}><ArrowDown size={16} /></button><button className="icon-button danger-text" aria-label={`Remove ${title}`} onClick={() => setConfirm(!confirm)}><Trash2 size={16} /></button></div><button className="primary-button entry-done" onClick={done}><Check size={16} />Done</button></div>{confirm && <div className="inline-confirm"><span>Remove this entry?</span><button className="text-button danger-text" onClick={onRemove}>Remove</button><button className="text-button" onClick={() => setConfirm(false)}>Keep</button></div>}</div>}</div>;
}
