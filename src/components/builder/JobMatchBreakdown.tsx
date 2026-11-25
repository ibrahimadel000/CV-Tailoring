import { useMemo } from 'react';
import { CheckCircle2, Layers, AlertTriangle } from 'lucide-react';
import type { CVProfile } from '@/types/schema';
import { analyzeJobMatch } from '@/services/resumeComposer/jobMatch';

export function JobMatchBreakdown({ profile, job }: { profile: CVProfile; job: string }) {
  const result = useMemo(() => analyzeJobMatch(profile, job), [profile, job]);
  const total = result.matched.length + result.listed.length + result.missing.length;
  if (!total) return null;

  return (
    <details className="job-match-card" open>
      <summary>
        Job requirement coverage · {result.matched.length + result.listed.length}/{total} found on CV
      </summary>
      <div className="match-groups">
        {result.matched.length > 0 && (
          <div className="match-group">
            <span className="match-label is-matched"><CheckCircle2 size={13} /> Demonstrated in experience ({result.matched.length})</span>
            <div className="match-pills">
              {result.matched.map(item => <span key={item} className="match-pill is-matched">{item}</span>)}
            </div>
          </div>
        )}
        {result.listed.length > 0 && (
          <div className="match-group">
            <span className="match-label is-listed"><Layers size={13} /> Listed in skills or credentials ({result.listed.length})</span>
            <div className="match-pills">
              {result.listed.map(item => <span key={item} className="match-pill is-listed">{item}</span>)}
            </div>
          </div>
        )}
        {result.missing.length > 0 && (
          <div className="match-group">
            <span className="match-label is-missing"><AlertTriangle size={13} /> Not on your CV yet ({result.missing.length})</span>
            <div className="match-pills">
              {result.missing.map(item => <span key={item} className="match-pill is-missing">{item}</span>)}
            </div>
          </div>
        )}
      </div>
      <p className="match-note">Literal keyword coverage from your current CV—not an ATS score. Only add missing items in the editor if you genuinely have that experience.</p>
    </details>
  );
}
