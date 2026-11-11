import './currentEntryComparison.css';
import type { CVProfile } from '@/types/schema';
import { hasExactBullet, pairCurrentEntries } from '@/services/resumeComposer/currentEntryComparison';

type ReviewEntry = { id: string; title: string; description?: string; bullets: { id: string; text: string }[] };
function reviewEntries(profile: CVProfile, section: 'experience' | 'projects'): ReviewEntry[] {
  return section === 'experience' ? profile.experience.data.map(entry => ({
    id: entry.id, title: [entry.roleTitle, entry.companyName].filter(Boolean).join(' · '),
    description: entry.description, bullets: entry.bullets,
  })) : profile.projects.data.map(entry => ({
    id: entry.id, title: [entry.name, entry.role].filter(Boolean).join(' · '), bullets: entry.bullets,
  }));
}
function EntryContent({ entry, compareWith }: { entry: ReviewEntry; compareWith?: ReviewEntry }) {
  return <>
    <p className="tailor-comparison-title" dir="auto">{entry.title || 'Untitled entry'}</p>
    {entry.description && <p className="tailor-comparison-text" dir="auto">{entry.description}</p>}
    {entry.bullets.length > 0 ? <ul>{entry.bullets.map((bullet, index) => <li key={`${bullet.id}-${index}`}>
      <span dir="auto">{bullet.text}</span>
      {compareWith && !hasExactBullet(bullet.text, compareWith.bullets) && <span className="tailor-comparison-flag">No exact text match in current tailored bullets</span>}
    </li>)}</ul> : <p>No bullets in this entry.</p>}
  </>;
}
export function CurrentEntryComparison({ source, copy }: { source: CVProfile; copy: CVProfile }) {
  return <>
    <p>These are the current versions, not a saved before-and-after snapshot. Entries are paired by ID. Either resume may have changed since tailoring.</p>
    <p>Labels compare exact bullet text only. A reworded bullet may preserve the same meaning; a match does not verify a claim. Review actions, outcomes, qualifications and attribution.</p>
    {(['experience', 'projects'] as const).map(section => {
      const label = section === 'experience' ? 'Experience' : 'Projects';
      const pairs = pairCurrentEntries(reviewEntries(source, section), reviewEntries(copy, section));
      if (!pairs.length) return <p key={section}>No {section} entries in either current resume.</p>;
      return <div key={section}><h3 className="tailor-comparison-heading">{label}</h3>{pairs.map((pair, index) => <article className="tailor-comparison-entry" key={`${index}-${pair.source?.id ?? pair.copy?.id}`} aria-label={`${label} comparison ${index + 1}`}>
        <section aria-label="Current source"><strong>Current source</strong>
          {pair.source ? <EntryContent entry={pair.source} compareWith={pair.copy} /> : <p>{pair.match === 'ambiguous' ? 'No unique ID match; entries are shown separately.' : 'No matching entry in the current source.'}</p>}
        </section>
        <section aria-label="Current tailored copy"><strong>Current tailored copy</strong>
          {pair.copy ? <EntryContent entry={pair.copy} /> : <p>{pair.match === 'ambiguous' ? 'No unique ID match; entries are shown separately.' : 'No matching entry in the current tailored copy.'}</p>}
        </section>
      </article>)}</div>;
    })}
    <p>Edit the tailored copy in the editor after reviewing.</p>
  </>;
}
