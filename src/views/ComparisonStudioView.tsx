import { CheckCircle2, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { DiffBulletCard } from '@/components/diff/DiffBulletCard';
import { useAppStore } from '@/store/useAppStore';

export function ComparisonStudioView() {
  const { masterProfile, tailoredProfile, setStep } = useAppStore();

  if (!masterProfile || !tailoredProfile) return null;

  // Calculate overall progress
  const allBullets = tailoredProfile.experience.flat();
  const totalBullets = allBullets.length;
  const reviewedBullets = allBullets.filter(b => b.status !== 'pending').length;
  const isComplete = totalBullets > 0 && reviewedBullets === totalBullets;
  const progressPct = totalBullets === 0 ? 0 : (reviewedBullets / totalBullets) * 100;

  return (
    <div className="max-w-4xl mx-auto pb-24" style={{ animation: 'var(--animate-fade-in)' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 bg-gradient-to-br from-[#f59e0b] to-[#22d3ee]" style={{ boxShadow: 'var(--shadow-glow)' }}>
            <CheckCircle2 size={24} color="white" />
          </div>
          <h2 className="text-3xl font-bold gradient-text mb-2">Review &amp; Compare</h2>
          <p className="text-on-surface-variant max-w-xl text-sm leading-relaxed">
            AI has drafted your tailored CV. Review the exact word-level changes below.{' '}
            Dismiss warnings, edit the live diff directly, and accept or reject each bullet point.
          </p>
        </div>

        {/* Progress Tracker */}
        <div className="glass-card rounded-xl px-5 py-4 min-w-[200px]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Progress</span>
            <span className="text-sm font-bold text-primary-400">{reviewedBullets} / {totalBullets}</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div 
              className="h-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #f59e0b, #22d3ee)'
              }}
            />
          </div>
        </div>
      </div>

      {/* Target JD Context Bar */}
      <div className="mb-10 p-4 rounded-xl glass-card flex gap-4 items-center">
        <FileText className="text-primary-400 shrink-0" style={{ color: '#2fd9f4' }} />
        <div>
          <p className="text-sm font-semibold text-on-surface">
            Tailoring for: {tailoredProfile.jobTitle || 'Target Role'}
          </p>
          <p className="text-xs text-on-surface-variant line-clamp-1">
            {tailoredProfile.company || 'Target Company'} — AI Match Score: {tailoredProfile.matchScore}%
          </p>
        </div>
      </div>

      {/* Experience Loop */}
      <div className="flex flex-col gap-10">
        {tailoredProfile.experience.map((expBullets, expIndex) => {
          if (expBullets.length === 0) return null;

          const firstBulletId = expBullets[0].sourceBulletId;
          const originalExp = masterProfile.experience.data.find(e => 
            e.bullets.some(b => b.id === firstBulletId)
          );

          return (
            <div key={expIndex} className="flex flex-col gap-4 relative">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-on-surface">
                  {originalExp?.roleTitle || 'Experience'}
                </h3>
                <span className="text-sm text-on-surface-variant">
                  at {originalExp?.companyName}
                </span>
                <div className="flex-1 h-px ml-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
              </div>

              <div className="flex flex-col gap-6 pl-4 border-l" style={{ borderColor: 'rgba(34,211,238,0.2)' }}>
                {expBullets.map((bullet, bulletIndex) => (
                  <DiffBulletCard 
                    key={bullet.id}
                    expIndex={expIndex}
                    bulletIndex={bulletIndex}
                    bullet={bullet}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Finalize CTA */}
      <div className="mt-16 flex justify-center sticky bottom-6 z-50">
        <Button 
          size="lg" 
          onClick={() => setStep('export')}
          disabled={!isComplete}
          className={`px-12 py-4 ${isComplete ? '' : 'opacity-50'}`}
          style={isComplete ? { boxShadow: 'var(--shadow-elevated)' } : {}}
        >
          {isComplete ? 'Proceed to PDF Export' : 'Review All Bullets to Continue'}
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}
