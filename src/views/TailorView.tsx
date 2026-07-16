import { useState } from 'react';
import { Bot, Sparkles, AlertCircle } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { useAppStore } from '@/store/useAppStore';
import { useExtensionBridge } from '@/hooks/useExtensionBridge';
import { tailorProfile } from '@/services/aiTailor';
import { validateTailoredResponse } from '@/services/validator';
import { v4 as uuidv4 } from 'uuid';
import type { ReviewBulletState, TailoredProfile } from '@/types/schema';

export function TailorView() {
  const { 
    masterProfile, 
    jobDescription, 
    setJobDescription, 
    setTailoredProfile,
    setStep,
    extensionConnected 
  } = useAppStore();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize the extension listener
  useExtensionBridge();

  const handleTailor = async () => {
    if (!masterProfile || !jobDescription?.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      // 1. Call Gemini LLM (returns AITailoredResponse)
      const aiResponse = await tailorProfile(masterProfile, jobDescription);
      
      // 2. Pass through 5-layer anti-hallucination validator
      const { flags, sanitizedResponse } = validateTailoredResponse(aiResponse, masterProfile);

      // 3. Transform into the ReviewBulletState structure needed by the UI
      const reviewExperiences: ReviewBulletState[][] = sanitizedResponse.experiences.map(exp => {
        return exp.bullets.map(bullet => ({
          id: uuidv4(),
          sourceBulletId: bullet.sourceBulletId,
          original: bullet.originalText,
          aiTailored: bullet.tailoredText,
          userEdited: bullet.tailoredText, // Initialize live draft with AI output
          diffTokens: [], // Will be computed by useDebouncedDiff hook on render
          status: 'pending',
          validationFlags: flags[bullet.sourceBulletId] || []
        }));
      });

      // 4. Construct final TailoredProfile
      const tailoredProfile: TailoredProfile = {
        id: uuidv4(),
        masterProfileId: masterProfile.profileId,
        jobDescription,
        jobTitle: sanitizedResponse.jobTitle,
        company: sanitizedResponse.company,
        createdAt: new Date().toISOString(),
        matchScore: sanitizedResponse.matchScore,
        missingSkills: sanitizedResponse.missingSkills,
        summary: sanitizedResponse.tailoredSummary,
        experience: reviewExperiences,
        selectedExperienceIds: sanitizedResponse.selectedExperienceIds,
        selectedProjectIds: sanitizedResponse.selectedProjectIds,
      };

      // 5. Save to store and proceed to Step 4
      setTailoredProfile(tailoredProfile);
      setStep('review');

    } catch (err: any) {
      console.error('Tailoring failed:', err);
      setError(err.message || 'An unexpected error occurred during AI generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-20" style={{ animation: 'var(--animate-fade-in)' }}>
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 bg-gradient-to-br from-[#9333ea] to-[#22d3ee]" style={{ boxShadow: 'var(--shadow-glow)' }}>
          <Bot size={32} color="white" />
        </div>
        <h2 className="text-3xl font-bold gradient-text mb-4">Tailor Your Profile</h2>
        <p className="text-on-surface-variant max-w-xl mx-auto">
          Paste the job description below. Our AI will select your most relevant experience, reorder your achievements, and optimize your keywords—without ever inventing facts.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-on-surface">Target Job Description</label>
          {extensionConnected && (
            <span className="text-xs px-3 py-1 rounded-full border font-semibold tracking-wide"
              style={{ background: 'rgba(34,211,238,0.1)', borderColor: 'rgba(34,211,238,0.25)', color: '#8aebff' }}>
              Extension Connected
            </span>
          )}
        </div>
        
        <textarea
          value={jobDescription || ''}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the full job description here..."
          className="input input--textarea h-[300px] font-mono text-sm leading-relaxed"
          disabled={isGenerating}
        />

        {error && (
          <div className="flex gap-3 p-4 rounded-xl glass-card border border-[rgba(255,180,171,0.25)] text-[#ffb4ab] text-sm mt-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold mb-1">Generation Failed</p>
              <p className="opacity-90">{error}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <Button 
            size="lg" 
            onClick={handleTailor} 
            disabled={!jobDescription?.trim() || isGenerating}
            className="w-full sm:w-auto px-8"
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing &amp; Tailoring...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Generate Tailored CV
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
