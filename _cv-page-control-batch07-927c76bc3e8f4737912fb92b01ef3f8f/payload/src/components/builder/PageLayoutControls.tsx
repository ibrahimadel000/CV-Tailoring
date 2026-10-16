import { useId, useState } from 'react';
import type { CVProfile, EntryPageLayout } from '@/types/schema';
import { useAppStore } from '@/store/useAppStore';

export function PageLayoutControls({ profile, section, entryId, disabled = false }: { profile: CVProfile; section: string; entryId?: string; disabled?: boolean }) {
  const id = useId();
  const value = entryId ? profile.pageLayout?.entries?.[entryId] || 'auto' : profile.pageLayout?.sections?.[section] || 'auto';
  const [expanded, setExpanded] = useState(value !== 'auto');
  const change = (next: string) => useAppStore.setState(state => ({ profiles: state.profiles.map(p => {
    if (p.profileId !== profile.profileId) return p;
    const key = entryId ? 'entries' : 'sections'; const target = entryId || section;
    const values: Record<string, EntryPageLayout> = { ...p.pageLayout?.[key] }; delete values[target];
    if (next !== 'auto') values[target] = next as Exclude<EntryPageLayout, 'auto'>;
    return { ...p, pageLayout: { ...p.pageLayout, [key]: values } };
  }) }));
  return <details className="page-layout-controls" open={expanded} onToggle={e => setExpanded(e.currentTarget.open)}>
    <summary>Page layout{value !== 'auto' && <span>{value === 'new-page' ? 'Manual page break' : 'Keep together'}</span>}</summary>
    <fieldset disabled={disabled}>
      <label htmlFor={id}>{entryId ? 'This entry' : 'This section'}</label>
      <select id={id} aria-describedby={`${id}-help`} value={value} onChange={e => change(e.target.value)}>
        <option value="auto">Automatic</option>
        {entryId && <option value="together">Keep this entry together</option>}
        <option value="new-page">Start on a new page</option>
      </select>
      <p id={`${id}-help`}>{value === 'new-page' ? 'A page break is added before this content. It may leave extra space on the previous page.' : value === 'together' ? 'Moves this entry to the next page if needed. Entries longer than a full page still split safely.' : entryId ? 'Short entries stay together. Longer entries flow across pages to avoid large gaps.' : 'Sections flow naturally. Headings stay with the first entry.'}</p>
      {value !== 'auto' && <button className="text-button" onClick={() => change('auto')}>{value === 'new-page' ? 'Remove manual page break' : 'Reset to Automatic'}</button>}
    </fieldset>
  </details>;
}
