import { FileUp, Lock, Unlock, Download } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { SummaryEditor } from '@/components/editors/SummaryEditor';
import { ExperienceCardEditor } from '@/components/editors/ExperienceCardEditor';
import { EducationCardEditor } from '@/components/editors/EducationCardEditor';
import { ProjectCardEditor } from '@/components/editors/ProjectCardEditor';
import { SkillTagEditor } from '@/components/editors/SkillTagEditor';
import { useAppStore } from '@/store/useAppStore';

export function ProfileBuilderView() {
  const { 
    masterProfile, 
    confirmAndLock, 
    unlockForEditing,
    error 
  } = useAppStore();

  if (!masterProfile) return null;

  const isLocked = masterProfile.summary.isLocked;

  return (
    <div className="max-w-4xl mx-auto pb-20" style={{ animation: 'var(--animate-fade-in)' }}>
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold gradient-text">Master Profile</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            {isLocked 
              ? "Your profile is locked and verified. You're ready to tailor."
              : "Build your ground-truth profile. AI will only use facts provided here."}
          </p>
        </div>
        
        <div className="flex gap-3">
          {!isLocked ? (
            <>
              <Button variant="secondary" className="hidden sm:flex">
                <FileUp size={18} />
                Upload PDF
              </Button>
              <Button onClick={confirmAndLock} className="min-w-[140px]">
                <Lock size={18} />
                Confirm &amp; Lock
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={unlockForEditing}>
              <Unlock size={18} />
              Unlock to Edit
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl glass-card border border-danger/30 text-danger bg-danger/10 text-sm font-medium flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => useAppStore.getState().setError(null)}>Dismiss</Button>
        </div>
      )}

      {/* Editor Sections */}
      <div className="flex flex-col gap-2">
        <SummaryEditor />
        <ExperienceCardEditor />
        <SkillTagEditor />
        <EducationCardEditor />
        <ProjectCardEditor />
      </div>

      {/* Bottom CTA */}
      {!isLocked ? (
        <div className="mt-12 flex justify-center">
          <Button onClick={confirmAndLock} size="lg" className="w-full sm:w-auto px-12">
            <Lock size={20} />
            Confirm &amp; Lock Profile
          </Button>
        </div>
      ) : (
        <div className="mt-12 flex justify-center">
          <Button 
            onClick={() => useAppStore.getState().setStep('tailor')} 
            size="lg" 
            className="w-full sm:w-auto px-12"
          >
            <Download size={20} className="rotate-90" />
            Proceed to AI Tailor
          </Button>
        </div>
      )}
    </div>
  );
}
