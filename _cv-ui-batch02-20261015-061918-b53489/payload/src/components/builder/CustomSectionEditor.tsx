import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { CVProfile } from '@/types/schema';
import type { SectionId } from './resumeModel';
export function CustomSectionEditor({ profile, section }: { profile: CVProfile; section: SectionId }) {
  const data = profile.customSections?.find(s => `custom:${s.id}` === section);
  if (!data) return null;
  const update = (changes: Partial<typeof data>) => useAppStore.setState(state => ({ profiles: state.profiles.map(p => p.profileId === profile.profileId ? { ...p, customSections: p.customSections?.map(s => s.id === data.id ? { ...s, ...changes } : s) } : p) }));
  const move = (i: number, delta: number) => {
    const paragraphs = [...data.paragraphs];
    [paragraphs[i], paragraphs[i + delta]] = [paragraphs[i + delta], paragraphs[i]];
    update({ paragraphs });
  };
  return <div className="custom-section-editor"><label className="builder-field"><span>Section title</span><input aria-label="Custom section title" value={data.title} maxLength={80} placeholder="e.g. Volunteering, Awards, Interests" onChange={e => update({ title: e.target.value })} /></label><p className="subtle-note">The title appears on your resume. Each paragraph below is exported as plain text.</p>{data.paragraphs.map((text, i) => <div className="custom-paragraph" key={i}><div><label htmlFor={`custom-paragraph-${data.id}-${i}`}>Paragraph {i + 1}</label><span><button className="icon-button" aria-label={`Move paragraph ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button><button className="icon-button" aria-label={`Move paragraph ${i + 1} down`} disabled={i === data.paragraphs.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button><button className="icon-button danger-text" aria-label={`Remove paragraph ${i + 1}`} onClick={() => { if (window.confirm('Remove this paragraph?')) update({ paragraphs: data.paragraphs.filter((_, j) => j !== i) }); }}><Trash2 size={15} /></button></span></div><textarea id={`custom-paragraph-${data.id}-${i}`} aria-label={`Custom paragraph ${i + 1}`} rows={5} value={text} placeholder="Write the details you want to include…" onChange={e => update({ paragraphs: data.paragraphs.map((x,j) => i === j ? e.target.value : x) })} /></div>)}<button className="secondary-button" onClick={() => update({ paragraphs: [...data.paragraphs, ''] })}><Plus size={16} />Add paragraph</button></div>;
}
