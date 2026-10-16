import { useRef, useState } from 'react';
import { ChevronDown, GripVertical, LockKeyhole, Plus } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import type { CVProfile, CustomSectionKind } from '@/types/schema';
import { useAppStore } from '@/store/useAppStore';
import { orderedSections, sectionCount, type BuiltInSectionId, type SectionId } from './resumeModel';
import { PageLayoutControls } from './PageLayoutControls';
import { SectionEditor } from './SectionEditor';
import { CustomSectionEditor } from './CustomSectionEditor';
import { useSectionDrag } from './useSectionDrag';

const suggestions: { title: string; kind: CustomSectionKind }[] = [
  { title: 'Languages', kind: 'skills' }, { title: 'Courses', kind: 'experience' },
  { title: 'Internships', kind: 'experience' }, { title: 'Volunteering', kind: 'experience' },
  { title: 'Achievements', kind: 'list' }, { title: 'References', kind: 'text' },
];
const formats: { kind: CustomSectionKind; title: string; description: string }[] = [
  { kind: 'text', title: 'Text', description: 'Introductions, interests & references' },
  { kind: 'experience', title: 'Experience', description: 'Roles, courses & volunteering' },
  { kind: 'list', title: 'Bullet list', description: 'Awards & achievements' },
  { kind: 'skills', title: 'Skills & languages', description: 'Short items with optional levels' },
];
export function SectionWorkspace({ profile, expanded, onExpand, onSelect }: { profile: CVProfile; expanded: SectionId | null; onExpand: (id: SectionId | null) => void; onSelect: (id: SectionId) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [removing, setRemoving] = useState<SectionId | null>(null);
  const [notice, setNotice] = useState('');
  const [choosingFormat, setChoosingFormat] = useState(false);
  const list = orderedSections(profile);
  const sort = useSectionDrag(profile, root);
  const open = (id: SectionId) => { onExpand(expanded === id ? null : id); onSelect(id); };
  const add = (title: string, kind: CustomSectionKind = 'text') => {
    const custom = { id: uuid(), title, kind, paragraphs: kind === 'text' ? [''] : [], entries: kind === 'experience' ? [{ id: uuid(), title: '', organization: '', startDate: '', endDate: '', description: '' }] : undefined };
    setChoosingFormat(false);
    const id: SectionId = `custom:${custom.id}`;
    useAppStore.setState(state => ({ profiles: state.profiles.map(p => p.profileId === profile.profileId ? { ...p, customSections: [...(p.customSections || []), custom], sectionOrder: [...orderedSections(p).map(s => s.id), id] } : p) }));
    onExpand(id); onSelect(id); setNotice(`${title} added. Start writing below.`);
    requestAnimationFrame(() => {
      const row = root.current?.querySelector<HTMLElement>(`[data-section-card="${id}"]`);
      const container = root.current?.closest<HTMLElement>('.editor-scroll');
      if (row && container) container.scrollTo({ top: container.scrollTop + row.getBoundingClientRect().top - container.getBoundingClientRect().top - 12, behavior: 'instant' });
      const target = title === 'Custom section' ? row?.querySelector<HTMLInputElement>('input[aria-label="Custom section title"]') : row?.querySelector<HTMLInputElement | HTMLTextAreaElement>('.entry-form input:not([type="checkbox"]), textarea, input[aria-label="Add section items"]');
      target?.focus({ preventScroll: true });
    });
  };
  const remove = (id: SectionId) => {
    useAppStore.setState(state => ({ profiles: state.profiles.map(p => p.profileId === profile.profileId ? { ...p, customSections: p.customSections?.filter(s => `custom:${s.id}` !== id), sectionOrder: p.sectionOrder?.filter(x => x !== id) } : p) }));
    setRemoving(null); if (expanded === id) onExpand(null); onSelect('personal'); setNotice('Custom section removed.');
  };
  return <div className="section-workspace" ref={root}>
    <p id={sort.helpId} className="sr-only">Drag the handle to a new position. Or focus it and use Up, Down, Home or End. Personal details stay first.</p>
    <div className={`section-accordion-list ${sort.endClass}`}>
      {list.map(item => { const isOpen = expanded === item.id; const count = sectionCount(profile, item.id); const custom = item.id.startsWith('custom:'); const panelId = `section-panel-${item.id.replace(':', '-')}`; return <div key={item.id} className={`section-accordion ${isOpen ? 'is-open' : ''} ${sort.rowClass(item.id)}`} data-section-card={item.id}>
        <div className="section-accordion-heading" data-sort-id={item.id}>
          {item.id === 'personal' ? <span className="section-fixed" title="Personal details always stay first"><LockKeyhole size={15} /></span> : <button {...sort.handleProps(item.id, item.title)}><GripVertical size={18} /></button>}
          <button className="section-accordion-toggle" aria-expanded={isOpen} aria-controls={panelId} onClick={() => open(item.id)}><span><strong>{item.title}</strong><small>{profile.pageLayout?.sections?.[item.id] === 'new-page' ? 'Manual page break · ' : ''}{item.id === 'personal' ? 'Name, contact details & links' : custom ? `${count} ${count === 1 ? 'item' : 'items'}` : count ? `${count} ${count === 1 ? 'item' : 'items'}` : 'Not added yet'}</small></span><ChevronDown size={17} className="accordion-chevron" /></button>
        </div>
        {isOpen && <div id={panelId} className="section-accordion-body">{!custom && <p className="accordion-description">{item.description}</p>}
          {removing === item.id && <div className="section-delete-confirm"><p>Delete this section and all its content?</p><button className="secondary-button" onClick={() => setRemoving(null)}>Keep it</button><button className="danger-button" onClick={() => remove(item.id)}>Delete section</button></div>}
          {item.id !== 'personal' && <PageLayoutControls profile={profile} section={item.id} disabled={!custom && profile[item.id as Exclude<BuiltInSectionId, 'personal'>].isLocked} />}
          {custom ? <CustomSectionEditor profile={profile} section={item.id} onRemove={() => setRemoving(item.id)} /> : <SectionEditor profile={profile} section={item.id as BuiltInSectionId} />}
        </div>}
      </div>; })}
    </div>
    <div className="quick-add-sections" id="quick-add-sections"><div><h3>Add a section</h3><span>Choose a section. Start writing right away.</span></div><div className="section-suggestions">{suggestions.filter(({ title }) => !list.some(s => s.title.toLowerCase() === title.toLowerCase())).map(({ title, kind }) => <button className="section-chip" key={title} onClick={() => add(title, kind)}><Plus size={16} />{title}</button>)}<button className="section-chip custom-section-chip" aria-expanded={choosingFormat} aria-controls="section-format-picker" onClick={() => { setChoosingFormat(!choosingFormat); if (!choosingFormat) requestAnimationFrame(() => { const picker = root.current?.querySelector<HTMLElement>('#section-format-picker'); const container = root.current?.closest<HTMLElement>('.editor-scroll'); if (picker && container) container.scrollTo({ top: container.scrollTop + picker.getBoundingClientRect().top - container.getBoundingClientRect().top - 12, behavior: 'instant' }); picker?.querySelector<HTMLButtonElement>('.section-format-options button')?.focus({ preventScroll: true }); }); }}><Plus size={16} />Custom section<ChevronDown size={15} /></button></div>
      {choosingFormat && <div id="section-format-picker" className="section-format-picker" onKeyDown={e => { if (e.key === 'Escape') { setChoosingFormat(false); root.current?.querySelector<HTMLButtonElement>('.custom-section-chip')?.focus(); } }}><div className="format-picker-heading"><strong>What would you like to add?</strong><button className="text-button" onClick={() => setChoosingFormat(false)}>Cancel</button></div><div className="section-format-options">{formats.map(f => <button key={f.kind} onClick={() => add('Custom section', f.kind)}><strong>{f.title}</strong><span>{f.description}</span></button>)}</div></div>}
      <p>Drag a section’s dots to move it. Empty sections stay out of your PDF.</p></div>
    <span className="sr-only" role="status" aria-live="polite">{sort.announcement}</span><span className="sr-only" role="status" aria-live="polite">{notice}</span>
    {sort.drag && <div className="section-drag-ghost" style={{ top: sort.drag.y + 14, left: Math.min(sort.drag.x + 14, window.innerWidth - 180) }}><GripVertical size={16} />{list.find(s => s.id === sort.drag?.id)?.title}</div>}
  </div>;
}
