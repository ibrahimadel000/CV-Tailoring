import { useRef, useState } from 'react';
import { ChevronDown, GripVertical, LockKeyhole, Plus, Trash2 } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import type { CVProfile } from '@/types/schema';
import { useAppStore } from '@/store/useAppStore';
import { orderedSections, sectionCount, type BuiltInSectionId, type SectionId } from './resumeModel';
import { SectionEditor } from './SectionEditor';
import { CustomSectionEditor } from './CustomSectionEditor';
import { useSectionDrag } from './useSectionDrag';

const suggestions = ['Languages', 'Courses', 'Internships', 'Volunteering', 'Achievements', 'References'];
export function SectionWorkspace({ profile, expanded, onExpand, onSelect }: { profile: CVProfile; expanded: SectionId | null; onExpand: (id: SectionId | null) => void; onSelect: (id: SectionId) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [removing, setRemoving] = useState<SectionId | null>(null);
  const [notice, setNotice] = useState('');
  const list = orderedSections(profile);
  const sort = useSectionDrag(profile, root);
  const open = (id: SectionId) => { onExpand(expanded === id ? null : id); onSelect(id); };
  const add = (title: string) => {
    const custom = { id: uuid(), title, paragraphs: [''] };
    const id: SectionId = `custom:${custom.id}`;
    useAppStore.setState(state => ({ profiles: state.profiles.map(p => p.profileId === profile.profileId ? { ...p, customSections: [...(p.customSections || []), custom], sectionOrder: [...orderedSections(p).map(s => s.id), id] } : p) }));
    onExpand(id); onSelect(id); setNotice(`${title} added. Rename it or start writing below.`);
    requestAnimationFrame(() => {
      const row = root.current?.querySelector<HTMLElement>(`[data-section-card="${id}"]`);
      const container = root.current?.closest<HTMLElement>('.editor-scroll');
      if (row && container) container.scrollTo({ top: container.scrollTop + row.getBoundingClientRect().top - container.getBoundingClientRect().top - 12, behavior: 'instant' });
      row?.querySelector<HTMLInputElement>('input[aria-label="Custom section title"]')?.focus({ preventScroll: true });
    });
  };
  const remove = (id: SectionId) => {
    useAppStore.setState(state => ({ profiles: state.profiles.map(p => p.profileId === profile.profileId ? { ...p, customSections: p.customSections?.filter(s => `custom:${s.id}` !== id), sectionOrder: p.sectionOrder?.filter(x => x !== id) } : p) }));
    setRemoving(null); if (expanded === id) onExpand(null); onSelect('personal'); setNotice('Custom section removed.');
  };
  return <div className="section-workspace" ref={root}>
    <p className="section-edit-instruction">Click a section to edit. Drag the dots to reorder.</p>
    <p id={sort.helpId} className="sr-only">Drag the handle to a new position. Or focus it and use Up, Down, Home or End. Personal details stay first.</p>
    <div className={`section-accordion-list ${sort.endClass}`}>
      {list.map(item => { const isOpen = expanded === item.id; const count = sectionCount(profile, item.id); const custom = item.id.startsWith('custom:'); const panelId = `section-panel-${item.id.replace(':', '-')}`; return <div key={item.id} className={`section-accordion ${isOpen ? 'is-open' : ''} ${sort.rowClass(item.id)}`} data-section-card={item.id}>
        <div className="section-accordion-heading" data-sort-id={item.id}>
          {item.id === 'personal' ? <span className="section-fixed" title="Personal details always stay first"><LockKeyhole size={15} /></span> : <button {...sort.handleProps(item.id, item.title)}><GripVertical size={18} /></button>}
          <button className="section-accordion-toggle" aria-expanded={isOpen} aria-controls={panelId} onClick={() => open(item.id)}><span><strong>{item.title}</strong><small>{item.id === 'personal' ? 'Name, contact details & links' : custom ? `${count} ${count === 1 ? 'paragraph' : 'paragraphs'}` : count ? `${count} ${count === 1 ? 'item' : 'items'}` : 'Not added yet'}</small></span><ChevronDown size={17} className="accordion-chevron" /></button>
        </div>
        {isOpen && <div id={panelId} className="section-accordion-body"><p className="accordion-description">{item.description}</p>{custom && <div className="custom-section-actions"><button className="text-button danger-text" aria-label={`Delete section ${item.title}`} onClick={() => setRemoving(item.id)}><Trash2 size={15} />Delete section</button></div>}
          {removing === item.id && <div className="section-delete-confirm"><p>Delete this section and all its paragraphs?</p><button className="secondary-button" onClick={() => setRemoving(null)}>Keep it</button><button className="danger-button" onClick={() => remove(item.id)}>Delete section</button></div>}
          {custom ? <CustomSectionEditor profile={profile} section={item.id} /> : <SectionEditor profile={profile} section={item.id as BuiltInSectionId} />}
        </div>}
      </div>; })}
    </div>
    <div className="quick-add-sections" id="quick-add-sections"><div><h3>Add a section</h3><span>Choose a heading, then add your details.</span></div><div className="section-suggestions">{suggestions.filter(title => !list.some(s => s.title.toLowerCase() === title.toLowerCase())).map(title => <button className="section-chip" key={title} onClick={() => add(title)}><Plus size={16} />{title}</button>)}<button className="section-chip custom-section-chip" onClick={() => add('Custom section')}><Plus size={16} />Custom section</button></div><p>Extra sections use editable titles and paragraphs. Empty sections stay out of your PDF.</p></div>
    <span className="sr-only" role="status" aria-live="polite">{sort.announcement}</span><span className="sr-only" role="status" aria-live="polite">{notice}</span>
    {sort.drag && <div className="section-drag-ghost" style={{ top: sort.drag.y + 14, left: Math.min(sort.drag.x + 14, window.innerWidth - 180) }}><GripVertical size={16} />{list.find(s => s.id === sort.drag?.id)?.title}</div>}
  </div>;
}
