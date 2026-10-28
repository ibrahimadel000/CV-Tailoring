import type { JobAssessment } from '@/types/schema';
export function JobAssessmentView({ assessment }: { assessment?: JobAssessment }) {
  if (!assessment) return null;
  const unassessed = assessment.inventoryCount - assessment.assessedCount;
  return <details className="tailor-review" data-testid="job-assessment"><summary>Job coverage · {assessment.assessedCount}/{assessment.inventoryCount} assessed</summary>
    <p>Uses your resume as the source. This is an AI source-match assessment, not a check of your honesty, a suitability guarantee or an ATS score. No extra answers are required to finish tailoring.</p>
    {!!unassessed && <p role="status">{unassessed} indexed requirement(s) were not assessed in this response. These are not classified as missing experience.</p>}
    {assessment.extractionWarnings.map((warning,i) => <p role="status" key={i}>{warning}</p>)}
    {assessment.rows.map(row => <div className="tailor-change" key={row.id}>
      <strong>{row.status === 'supported' ? 'Source match' : row.status === 'related' ? 'Partial source match' : row.status === 'not_assessed' ? 'Not assessed' : 'Not stated in this resume'}</strong>
      <span>{row.priority === 'required' ? 'Required' : row.priority === 'preferred' ? 'Preferred' : 'Responsibility'}</span>
      <p dir="auto">{row.jobQuote}</p>
      {!!row.evidence.length && <details><summary>Source passages · {row.evidence.length}</summary>{row.evidence.map(e => <div key={e.id}><span>{e.label}</span><p dir="auto">{e.text}</p></div>)}</details>}
    </div>)}
  </details>;
}
