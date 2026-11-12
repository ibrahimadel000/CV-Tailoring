import './currentEntryComparison.css';
import type { CVProfile } from '@/types/schema';
import { hasExactBullet, pairCurrentEntries } from '@/services/resumeComposer/currentEntryComparison';

type ReviewEntry = { id: string; fields: { label: string; value?: string }[]; bullets: { id: string; text: string }[] };
function reviewEntries(profile: CVProfile, section: 'experience' | 'projects'): ReviewEntry[] {
  return section === 'experience' ? profile.experience.data.map(entry => ({
    id: entry.id, fields: [
      { label: 'Job title', value: entry.roleTitle }, { label: 'Organization', value: entry.companyName },
      { label: 'Location', value: entry.city }, { label: 'Start date', value: entry.startDate },
      { label: 'End date', value: entry.endDate }, { label: 'Overview', value: entry.description },
    ], bullets: entry.bullets,
  })) : profile.projects.data.map(entry => ({
    id: entry.id, fields: [
      { label: 'Project name', value: entry.name }, { label: 'Project role', value: entry.role },
      { label: 'Project link', value: entry.url },
    ], bullets: entry.bullets,
  }));
}
function EntryContent({ entry, compareWith, unmatchedLabel }: { entry: ReviewEntry; compareWith?: ReviewEntry; unmatchedLabel: string }) {
  return <>
    {entry.fields.map(field => <p className="tailor-comparison-field" key={field.label}>
      <span className="tailor-comparison-field-label">{field.label}: </span><span dir="auto">{field.value?.trim() ? field.value : 'Not provided'}</span>
    </p>)}
    {entry.bullets.length > 0 ? <ul>{entry.bullets.map((bullet, index) => <li key={`${bullet.id}-${index}`}>
      <span dir="auto">{bullet.text}</span>
      {compareWith && !hasExactBullet(bullet.text, compareWith.bullets) && <span className="tailor-comparison-flag">{unmatchedLabel}</span>}
    </li>)}</ul> : <p>No bullets in this entry.</p>}
  </>;
}
export function CurrentEntryComparison({ source, copy }: { source: CVProfile; copy: CVProfile }) {
  return <>
    <p>These are the current versions, not a saved before-and-after snapshot. Entries are paired by ID. Either resume may have changed since tailoring.</p>
    <p>Entry fields are shown as currently saved; missing values are marked Not provided. Labels on bullets compare exact text within the same entry only. They do not pair individual bullets. A reworded bullet may preserve the same meaning; a match does not verify a claim. Review actions, outcomes, qualifications and attribution.</p>
    {(['experience', 'projects'] as const).map(section => {
      const label = section === 'experience' ? 'Experience' : 'Projects';
      const pairs = pairCurrentEntries(reviewEntries(source, section), reviewEntries(copy, section));
      if (!pairs.length) return <p key={section}>No {section} entries in either current resume.</p>;
      return <div key={section}><h3 className="tailor-comparison-heading">{label}</h3>{pairs.map((pair, index) => <article className="tailor-comparison-entry" key={`${index}-${pair.source?.id ?? pair.copy?.id}`} aria-label={`${label} comparison ${index + 1}`}>
        <section aria-label="Current source"><strong>Current source</strong>
          {pair.source ? <EntryContent entry={pair.source} compareWith={pair.copy} unmatchedLabel="No exact text match in current tailored bullets" /> : <p>{pair.match === 'ambiguous' ? 'No unique ID match; entries are shown separately.' : 'No matching entry in the current source.'}</p>}
        </section>
        <section aria-label="Current tailored copy"><strong>Current tailored copy</strong>
          {pair.copy ? <EntryContent entry={pair.copy} compareWith={pair.source} unmatchedLabel="No exact text match in current source bullets" /> : <p>{pair.match === 'ambiguous' ? 'No unique ID match; entries are shown separately.' : 'No matching entry in the current tailored copy.'}</p>}
        </section>
      </article>)}</div>;
    })}
    <p>Edit the tailored copy in the editor after reviewing.</p>
  </>;
}
