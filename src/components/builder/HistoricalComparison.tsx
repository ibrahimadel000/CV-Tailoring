import type { CompositionSnapshot } from '@/types/schema';
import { plainText } from './resumeModel';

type Side = CompositionSnapshot['source'];
function HistoricalSide({ title, side }: { title: string; side: Side }) {
  return <section aria-label={title}>
    <h3 className="tailor-comparison-heading">{title}</h3>
    <h4>Summary</h4><p className="tailor-comparison-field" dir="auto">{plainText(side.summary) || '(Empty)'}</p>
    {(['experience', 'projects'] as const).map(section => <div key={section}>
      <h4>{section === 'experience' ? 'Experience' : 'Projects'}</h4>
      {!side[section].length && <p>No entries.</p>}
      {side[section].map((entry, index) => <div className="tailor-comparison-entry" key={index}>
        <section aria-label={`${section === 'experience' ? 'Experience' : 'Project'} ${index + 1}`}>
          {entry.fields.map(field => <p className="tailor-comparison-field" key={field.label}><span className="tailor-comparison-field-label">{field.label}: </span><span dir="auto">{(field.label === 'Overview' ? plainText(field.value) : field.value) || 'Not provided'}</span></p>)}
          {entry.bullets.length ? <ul>{entry.bullets.map((bullet, i) => <li key={i}><span dir="auto">{plainText(bullet) || '(Empty)'}</span></li>)}</ul> : <p>No bullets in this entry.</p>}
        </section>
      </div>)}
    </div>)}
  </section>;
}
export function HistoricalComparison({ snapshot }: { snapshot: CompositionSnapshot }) {
  return <>
    <p>These are the source and final compiled copy at generation, not their current versions. Later edits are not reflected. Project links and other sections are not included. Summary, overview and bullets use the same text projection as the resume preview; saved raw formatting is not shown.</p>
    <p>Each side is shown in its own order, including all source passages. No individual passage attribution or semantic or factual verification is implied. Compare context, qualifications, actions and results before export.</p>
    <HistoricalSide title="Source at generation" side={snapshot.source} />
    <HistoricalSide title="Generated copy at generation" side={snapshot.generated} />
  </>;
}
