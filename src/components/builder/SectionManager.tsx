import { ArrowUp, ArrowDown, Plus, LockKeyhole, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useAppStore } from '@/store/useAppStore';
import type { CVProfile } from '@/types/schema';
import { orderedSections, type SectionId } from './resumeModel';
export function SectionManager({ profile, onEdit, onDelete }: { profile: CVProfile; onEdit: (id: SectionId) => void; onDelete: (id: SectionId) => void }) {
  const list = orderedSections(profile);
  const [removing, setRemoving] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const reorder = (index: number, direction: number) => {
    const ids = list.map(s => s.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    useAppStore.setState(state => ({ profiles: state.profiles.map(p => p.profileId === profile.profileId ? { ...p, sectionOrder: ids } : p) }));
  };
  const add = () => {
    const id = uuid();
    useAppStore.setState(state => ({ profiles: state.profiles.map(p => p.profileId === profile.profileId ? { ...p, customSections: [...(p.customSections || []), { id, title: title.trim() || 'Additional information', paragraphs: [''] }], sectionOrder: [...list.map(s => s.id), `custom:${id}`] } : p) }));
    setTitle(''); onEdit(`custom:${id}`);
  };
  const remove = (id: SectionId) => {
    useAppStore.setState(state => ({ profiles: state.profiles.map(p => p.profileId === profile.profileId ? { ...p, customSections: p.customSections?.filter(s => `custom:${s.id}` !== id), sectionOrder: p.sectionOrder?.filter(x => x !== id) } : p) }));
    setRemoving(null); onDelete(id);
  };
  return <div className="section-manager"><p className="manager-intro">Arrange your resume in the order that tells your story best. The same order is used in the PDF.</p><div className="section-order-list">{list.map((s,i) => <div key={s.id} className="section-order-row"><span className="order-number">{i === 0 ? <LockKeyhole size={15} /> : <span>{i + 1}</span>}</span><button className="section-order-name" onClick={() => onEdit(s.id)}>{s.title}<small>{i === 0 ? 'Personal details always stay first' : s.id.startsWith('custom:') ? 'Custom paragraph section' : 'Standard section'}</small></button><div className="section-order-actions"><button className="icon-button" aria-label={`Move section ${s.title} up`} disabled={i <= 1} onClick={() => reorder(i,-1)}><ArrowUp size={16} /></button><button className="icon-button" aria-label={`Move section ${s.title} down`} disabled={i === 0 || i === list.length - 1} onClick={() => reorder(i,1)}><ArrowDown size={16} /></button>{s.id.startsWith('custom:') && <button className="icon-button danger-text" aria-label={`Delete section ${s.title}`} onClick={() => setRemoving(s.id)}><Trash2 size={16} /></button>}</div>{removing === s.id && <div className="section-delete-confirm"><p>Delete this section and all its paragraphs?</p><button className="secondary-button" onClick={() => setRemoving(null)}>Keep section</button><button className="danger-button" onClick={() => remove(s.id)}>Delete section</button></div>}</div>)}</div><div className="new-section-form"><label className="builder-field"><span>New section title</span><input aria-label="New section title" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Volunteering, Awards, Publications…" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} /></label><button className="primary-button" onClick={add}><Plus size={16} />Add custom section</button></div><p className="subtle-note">Switch between sections by clicking their names. Empty sections do not appear in the exported resume.</p></div>;
}
