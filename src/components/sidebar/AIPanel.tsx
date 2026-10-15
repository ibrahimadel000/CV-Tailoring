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
      <div className="p-5 border-b border-gray-200 flex justify-between items-center shrink-0 bg-white">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-600" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            <span>AI Tailor Studio</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Keyword optimization & ATS alignment</p>
        </div>
      </div>

      <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar bg-white">
        {/* Score Ring (only if this profile is tailored) */}
        {activeProfile?.targetJob && (
          <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-gray-50 border border-gray-200">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" fill="none" r="45" stroke="#e5e7eb" strokeWidth="8" />
                <circle 
                  className="transition-all duration-1000 ease-out" 
                  cx="50" cy="50" fill="none" r="45" 
                  strokeDasharray={circumference} 
                  strokeDashoffset={strokeDashoffset} 
                  strokeLinecap="round" strokeWidth="8" 
                  stroke="#7c3aed"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">{score}</span>
                <span className="text-[11px] font-medium text-gray-500">/100</span>
              </div>
            </div>
            <p className="mt-3 text-xs font-semibold text-primary-700 text-center">
              Targeting: {activeProfile.targetJob}
            </p>
          </div>
        )}

        {/* Job Description Card */}
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200 mt-auto">
          <label className="font-semibold text-xs text-gray-700 uppercase tracking-wider">Job Description</label>
          <textarea 
            value={jobDescription || ''}
            onChange={(e) => setJobDescription(e.target.value)}
            className="input input--textarea text-xs h-32 bg-white" 
            placeholder="Paste target job description to match skills and keywords..." 
          />
          <button 
            onClick={handleGenerate}
            disabled={!jobDescription || isGenerating}
            className="btn btn--primary w-full text-xs font-semibold py-2.5 shadow-sm"
          >
            {isGenerating ? 'Analyzing & Tailoring...' : 'Optimize Resume with AI'}
          </button>
        </div>
      </div>
    </>
  );
}
