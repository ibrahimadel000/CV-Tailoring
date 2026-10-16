import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useAppStore } from '@/store/useAppStore';
import type { CVProfile, CustomExperienceEntry } from '@/types/schema';
import type { SectionId } from './resumeModel';
import { CheckField, EntryCard, EntryGroup, Field } from './EditorControls';

export function CustomSectionEditor({ profile, section, onRemove }: { profile: CVProfile; section: SectionId; onRemove?: () => void }) {
  const data = profile.customSections?.find(s => `custom:${s.id}` === section);
  const [skillText, setSkillText] = useState('');
  if (!data) return null;
  const kind = data.kind || 'text';
  const entries = data.entries || [];
  const update = (changes: Partial<typeof data>) => useAppStore.setState(state => ({ profiles: state.profiles.map(p => p.profileId === profile.profileId ? { ...p, customSections: p.customSections?.map(s => s.id === data.id ? { ...s, ...changes } : s) } : p) }));
  const editEntry = (id: string, changes: Partial<CustomExperienceEntry>) => update({ entries: entries.map(e => e.id === id ? { ...e, ...changes } : e) });
  const move = (index: number, delta: number) => {
    const next = [...entries];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    update({ entries: next });
  };
  const addSkills = () => {
    const names = skillText.split(',').map(x => x.trim()).filter(Boolean).filter((name, i, all) => all.findIndex(x => x.toLowerCase() === name.toLowerCase()) === i);
    if (!names.length) return;
    update({ paragraphs: [...data.paragraphs, ...names.filter(name => !data.paragraphs.some(x => x.toLowerCase() === name.toLowerCase()))] });
    setSkillText('');
  };
  return <EntryGroup><div className="custom-section-editor">
    <div className="custom-format-note">{({ text: 'Text section', experience: 'Experience section', list: 'Bullet list', skills: 'Skills & languages' })[kind]}<button className="icon-button danger-text" aria-label={`Delete section ${data.title}`} onClick={onRemove}><Trash2 size={16} /></button></div>
    <label className="builder-field"><span>Section title</span><input aria-label="Custom section title" value={data.title} maxLength={80} placeholder="Name this section" onChange={e => update({ title: e.target.value })} /></label>
    {kind === 'text' && <Field label="Section content" area value={data.paragraphs.join('\n\n')} onChange={v => update({ paragraphs: v.split('\n\n') })} placeholder="Write your details here…" hint="Leave a blank line between paragraphs. Empty content stays out of your PDF." />}
    {kind === 'list' && <Field label="List items" area value={data.paragraphs.join('\n')} onChange={v => update({ paragraphs: v.split('\n') })} placeholder={'Received a community service award\nOrganized a student showcase'} hint="One item per line. Bullet points are added automatically in your resume." />}
    {kind === 'skills' && <><div className="skill-tags custom-skill-tags">{data.paragraphs.map((name, i) => name.trim() ? <span key={`${name}-${i}`}>{name}<button aria-label={`Remove ${name}`} onClick={() => update({ paragraphs: data.paragraphs.filter((_, index) => index !== i) })}><X size={15} /></button></span> : null)}</div><div className="custom-skill-add"><label className="builder-field"><span>Add items</span><input aria-label="Add section items" value={skillText} placeholder="e.g. English (fluent), Spanish" onChange={e => setSkillText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addSkills(); } }} /></label><button className="secondary-button" disabled={!skillText.trim()} onClick={addSkills}><Plus size={16} />Add</button></div><p className="subtle-note">Separate items with commas or press Enter. Add a level in parentheses if useful.</p></>}
    {kind === 'experience' && <>
      {entries.map((e, i) => <EntryCard key={e.id} title={e.title || 'Untitled entry'} subtitle={e.organization} startOpen={!e.title && !e.organization} onRemove={() => update({ entries: entries.filter(x => x.id !== e.id) })} onUp={i ? () => move(i, -1) : undefined} onDown={i < entries.length - 1 ? () => move(i, 1) : undefined}>
        <Field label="Role / course title" value={e.title} placeholder="e.g. Volunteer mentor or UX Design course" onChange={v => editEntry(e.id, { title: v })} />
        <Field label="Organization / provider" value={e.organization} onChange={v => editEntry(e.id, { organization: v })} />
        <Field label="Location (optional)" value={e.location} onChange={v => editEntry(e.id, { location: v })} />
        <div className="form-grid"><Field label="Start date" value={e.startDate} placeholder="Jan 2024" onChange={v => editEntry(e.id, { startDate: v })} /><Field label="End date" value={e.endDate} placeholder="Jun 2024" onChange={v => editEntry(e.id, { endDate: v })} /></div>
        <CheckField label="Ongoing" checked={e.endDate === 'Present'} onChange={v => editEntry(e.id, { endDate: v ? 'Present' : '' })} />
        <Field label="Description" area value={e.description} onChange={v => editEntry(e.id, { description: v })} />
      </EntryCard>)}
      <button className="secondary-button" onClick={() => update({ entries: [...entries, { id: uuid(), title: '', organization: '', startDate: '', endDate: '', description: '' }] })}><Plus size={16} />Add entry</button>
    </>}
  </div></EntryGroup>;
}
