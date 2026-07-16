import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { tailorProfile } from '@/services/aiTailor';
import { validateTailoredResponse } from '@/services/validator';

export function AIPanel() {
  const { 
    profiles,
    activeProfileId,
    jobDescription, 
    setJobDescription, 
    setLoading,
    cloneProfile,
    applyTailoredResponse
  } = useAppStore();

  const activeProfile = profiles.find(p => p.profileId === activeProfileId);

  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!activeProfile || !jobDescription) return;
    
    setIsGenerating(true);
    setLoading(true);
    try {
      const aiResponse = await tailorProfile(activeProfile, jobDescription);
      const { sanitizedResponse } = validateTailoredResponse(aiResponse, activeProfile);

      cloneProfile(
        activeProfile.profileId, 
        `${activeProfile.profileName} - ${sanitizedResponse.jobTitle}`, 
        true, 
        jobDescription, 
        sanitizedResponse.matchScore
      );

      applyTailoredResponse(sanitizedResponse);
    } catch (err) {
      console.error(err);
      alert('Failed to generate tailored resume.');
    } finally {
      setIsGenerating(false);
      setLoading(false);
    }
  };

  const score = activeProfile?.matchScore || 0;
  
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <>
      <div className="p-6 border-b border-white/5 bg-surface-container/20 flex justify-between items-center shrink-0">
        <div>
          <h2 className="font-headline-md text-headline-md flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-container" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary-container to-secondary-container">AI Studio</span>
          </h2>
        </div>
      </div>

      <div className="flex-1 p-6 flex flex-col gap-8 overflow-y-auto custom-scrollbar">
        {/* Score Ring (only if this profile is tailored) */}
        {activeProfile?.targetJob && (
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="var(--color-primary-container)" />
                    <stop offset="100%" stopColor="var(--color-secondary-container)" />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" fill="none" r="45" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                <circle 
                  className="score-ring transition-all duration-1000 ease-out" 
                  cx="50" cy="50" fill="none" r="45" 
                  strokeDasharray={circumference} 
                  strokeDashoffset={strokeDashoffset} 
                  strokeLinecap="round" strokeWidth="8" 
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display-lg-mobile text-display-lg-mobile font-bold text-white">{score}</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">/100</span>
              </div>
            </div>
            <p className="mt-4 font-body-md text-body-md text-primary text-center">
              Targeting: {activeProfile.targetJob}
            </p>
          </div>
        )}

        {/* Target JD Input */}
        <div className="flex-1 flex flex-col gap-2">
          <label className="font-body-md text-body-md font-semibold text-on-surface">Target Job Description</label>
          <p className="font-label-sm text-label-sm text-on-surface-variant mb-2">Paste the JD here to tailor your CV</p>
          <textarea 
            value={jobDescription || ''}
            onChange={(e) => setJobDescription(e.target.value)}
            className="flex-1 input-recessed rounded-xl p-4 text-on-background font-body-md text-body-md resize-none" 
            placeholder="Looking for a Lead Product Designer with experience in SaaS, Design Systems..." 
          />
        </div>
      </div>

      {/* Action Area */}
      <div className="p-6 border-t border-white/5 bg-surface-container/40 shrink-0">
        <button 
          onClick={handleGenerate}
          disabled={!jobDescription || isGenerating}
          className="w-full primary-btn-glow py-4 rounded-xl flex items-center justify-center gap-3 font-body-lg text-body-lg font-bold text-on-primary"
        >
          {isGenerating ? (
            <span className="flex items-center gap-2 animate-pulse">
              <span className="material-symbols-outlined animate-spin" style={{ fontVariationSettings: "'FILL' 1" }}>sync</span>
              Tailoring...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              Tailor CV Now
            </span>
          )}
        </button>
      </div>
    </>
  );
}
