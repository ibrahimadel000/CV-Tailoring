import type { 
  CVProfile, 
  AITailoredResponse, 
  ValidationFlag 
} from '@/types/schema';
import { extractEntities } from './entityExtractor';

/**
 * The 5-Layer Post-AI Validation Pipeline.
 * Enforces zero-hallucination structural integrity.
 */
export function validateTailoredResponse(
  aiResponse: AITailoredResponse,
  profile: CVProfile
): { flags: Record<string, ValidationFlag[]>, sanitizedResponse: AITailoredResponse } {
  
  const whitelist = extractEntities(profile);
  const flags: Record<string, ValidationFlag[]> = {}; // Map of sourceBulletId to array of flags
  
  // Deep copy so we can mutate safely
  const sanitizedResponse: AITailoredResponse = JSON.parse(JSON.stringify(aiResponse));

  // Layer 1 & 4: Structural Integrity & Schema Validation
  // Ensure we don't invent new experiences, and every bullet maps to a real master bullet
  const validExperienceIds = new Set(profile.experience.data.map(e => e.id));
  
  sanitizedResponse.experiences = sanitizedResponse.experiences.filter(exp => {
    if (!validExperienceIds.has(exp.experienceId)) return false; // AI invented an experience entry
    
    const masterExp = profile.experience.data.find(e => e.id === exp.experienceId)!;
    const validBulletIds = new Set(masterExp.bullets.map(b => b.id));
    
    exp.bullets = exp.bullets.filter(bullet => {
      // Must map to real bullet ID
      if (!validBulletIds.has(bullet.sourceBulletId)) return false;
      
      const originalText = masterExp.bullets.find(b => b.id === bullet.sourceBulletId)!.text;
      
      // Original text echo MUST match (prevents sneaky substitution)
      if (bullet.originalText !== originalText) {
        bullet.originalText = originalText; 
      }

      // Initialize flags array for this bullet
      flags[bullet.sourceBulletId] = [];

      // Layer 3: Metric Guard
      const tailoredMetrics = extractMetrics(bullet.tailoredText);
      tailoredMetrics.forEach(metric => {
        if (!whitelist.metrics.has(metric)) {
          flags[bullet.sourceBulletId].push({
            type: 'fabricated_metric',
            value: metric,
            severity: 'critical',
            dismissed: false
          });
        }
      });

      // Layer 2: Entity Whitelist (Proper Nouns & Technologies)
      const tailoredNouns = extractProperNouns(bullet.tailoredText);
      tailoredNouns.forEach(noun => {
        if (
          !whitelist.properNouns.has(noun) && 
          !whitelist.technologies.has(noun) &&
          !whitelist.companyNames.has(noun)
        ) {
          flags[bullet.sourceBulletId].push({
            type: 'unknown_proper_noun',
            value: noun,
            severity: 'warning',
            dismissed: false
          });
        }
      });

      return true;
    });

    return exp.bullets.length > 0;
  });

  return { flags, sanitizedResponse };
}

// Re-using the same extraction logic from entityExtractor to compare apples-to-apples
function extractMetrics(text: string): string[] {
  const metricRegex = /\b(?:\$|€|£)?\d+(?:,\d{3})*(?:\.\d+)?(?:%|[a-zA-Z]*\+?|\+)?\b/g;
  const matches = text.match(metricRegex);
  return matches ? matches.map(m => m.toLowerCase()) : [];
}

function extractProperNouns(text: string): string[] {
  const sentences = text.split(/[.!?]\s+/);
  const nouns: string[] = [];
  sentences.forEach(sentence => {
    const words = sentence.trim().split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const word = words[i].replace(/[^a-zA-Z0-9-]/g, '');
      if (word && /^[A-Z][a-z0-9]*/.test(word)) {
        nouns.push(word.toLowerCase());
      }
    }
  });
  return nouns;
}
