import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, Trash2 } from 'lucide-react';

type Visibility = { label: string; checked: boolean; onChange: (value: boolean) => void };
export function CheckField({ label, checked, onChange }: Visibility) {
  return <label className="check-field"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span>{label}</span></label>;
}
export function Field({ label, value, onChange, placeholder, type = 'text', area = false, hint, visibility }: { label: string; value?: string; onChange: (value: string) => void; placeholder?: string; type?: string; area?: boolean; hint?: string; visibility?: Visibility }) {
  const id = useId();
  return <div className={`builder-field ${visibility?.checked === false ? 'field-not-shown' : ''}`}><div className="field-label-row"><label htmlFor={id}>{label}</label>{visibility && <label className="field-visibility" title={visibility.checked ? 'Included on your resume' : 'Hidden from your resume; your text is kept'}><input type="checkbox" aria-label={visibility.label} checked={visibility.checked} onChange={e => visibility.onChange(e.target.checked)} /><span>{visibility.checked ? 'Show' : 'Hidden'}</span></label>}</div>{area ? <textarea id={id} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={5} /> : <input id={id} type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}{hint && <small>{hint}</small>}</div>;
}
const Editing = createContext<{ active: string | null; setActive: (id: string | null) => void } | null>(null);
export function EntryGroup({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  return <Editing.Provider value={{ active, setActive }}>{children}</Editing.Provider>;
}
export function EntryCard({ title, subtitle, children, onRemove, onUp, onDown, startOpen = false }: { title: string; subtitle?: string; startOpen?: boolean; children: ReactNode; onRemove: () => void; onUp?: () => void; onDown?: () => void }) {
  const group = useContext(Editing);
  const [localOpen, setLocalOpen] = useState(startOpen);
  const [confirm, setConfirm] = useState(false);
  const id = useId();
  const form = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const open = group ? group.active === id : localOpen;
  const setOpen = (next: boolean) => { if (group) group.setActive(next ? id : null); else setLocalOpen(next); setConfirm(false); };
  useEffect(() => { if (startOpen) { if (group) group.setActive(id); setTimeout(() => form.current?.querySelector<HTMLInputElement>('input:not([type="checkbox"])')?.focus(), 0); } }, []);
  const done = () => { setOpen(false); toggle.current?.focus({ preventScroll: true }); };
  return <div className={`entry-card ${open ? 'entry-is-editing' : ''}`}><div className="entry-heading"><button ref={toggle} className="entry-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}><span><strong>{title}</strong><small>{subtitle || 'Add the details for this entry'}</small></span><span className="entry-edit-label">{open ? 'Editing' : 'Edit'}</span><ChevronDown size={17} style={{ transform: open ? 'rotate(180deg)' : '' }} /></button></div>{open && <div id={id} className="entry-form" ref={form}>{children}<div className="entry-form-footer"><div className="entry-secondary-actions"><button className="icon-button" aria-label={`Move ${title} up`} onClick={onUp} disabled={!onUp}><ArrowUp size={16} /></button><button className="icon-button" aria-label={`Move ${title} down`} onClick={onDown} disabled={!onDown}><ArrowDown size={16} /></button><button className="icon-button danger-text" aria-label={`Remove ${title}`} onClick={() => setConfirm(!confirm)}><Trash2 size={16} /></button></div><button className="primary-button entry-done" onClick={done}><Check size={16} />Done</button></div>{confirm && <div className="inline-confirm"><span>Remove this entry?</span><button className="text-button danger-text" onClick={onRemove}>Remove</button><button className="text-button" onClick={() => setConfirm(false)}>Keep</button></div>}</div>}</div>;
}
