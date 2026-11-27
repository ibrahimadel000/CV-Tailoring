import { useMemo } from 'react';
import { CheckCircle2, Layers, AlertTriangle, ArrowUpRight, Sparkles } from 'lucide-react';
import type { CVProfile } from '@/types/schema';
import { analyzeJobMatch, compareJobMatch, reconstructBaselineProfile } from '@/services/resumeComposer/jobMatch';

export function JobMatchBreakdown({
  profile,
  job,
  baseline,
  onJumpToSection,
}: {
  profile: CVProfile;
  job: string;
  baseline?: CVProfile | null;
  onJumpToSection?: (section: 'experience' | 'skills') => void;
}) {
  const effectiveBaseline = useMemo(
    () => reconstructBaselineProfile(profile) ?? baseline ?? null,
    [baseline, profile],
  );
  const comparison = useMemo(
    () => (effectiveBaseline ? compareJobMatch(effectiveBaseline, profile, job) : null),
    [effectiveBaseline, profile, job],
  );
  const fallbackResult = useMemo(
    () => (comparison ? comparison.after : analyzeJobMatch(profile, job)),
    [comparison, profile, job],
  );
  const result = fallbackResult;
  const total = result.matched.length + result.listed.length + result.missing.length;
  if (!total) return null;

  const covered = result.matched.length + result.listed.length;
  const liftLabel = comparison && comparison.matchedDelta > 0
    ? ` · +${comparison.matchedDelta} highlighted in summary/experience`
    : '';

  return (
    <details className="job-match-card" open>
      <summary>
        Job requirement coverage · {covered}/{total} found on CV{liftLabel}
      </summary>
      {comparison && comparison.newlyDemonstrated.length > 0 && (
        <p className="match-note">
          <Sparkles size={13} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} />
          Tailoring surfaced <strong>{comparison.newlyDemonstrated.slice(0, 5).join(', ')}</strong> in your top narrative.
        </p>
      )}
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
      {result.listed.length > 0 && (
        <p className="match-note">
          <strong>Quick win:</strong> You already list <strong>{result.listed.slice(0, 3).join(', ')}</strong>—adding where you used them in a real Experience or Project bullet makes this CV even stronger.
          {onJumpToSection && (
            <>
              {' '}
              <button type="button" className="text-button" onClick={() => onJumpToSection('experience')}>
                Open Experience <ArrowUpRight size={12} />
              </button>
            </>
          )}
        </p>
      )}
      <p className="match-note">
        Literal keyword coverage from your current CV—not an ATS score. Only add missing items if you genuinely have that experience.
        {onJumpToSection && result.missing.length > 0 && (
          <>
            {' '}
            <button type="button" className="text-button" onClick={() => onJumpToSection('skills')}>
              Edit Skills <ArrowUpRight size={12} />
            </button>
          </>
        )}
      </p>
    </details>
  );
}
