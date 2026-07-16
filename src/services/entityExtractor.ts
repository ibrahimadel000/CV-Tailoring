import type { CVProfile, MasterProfileEntities } from '@/types/schema';

/**
 * Extracts a whitelist of entities from a locked CVProfile to be used
 * for zero-hallucination validation during AI tailoring.
 */
export function extractEntities(profile: CVProfile): MasterProfileEntities {
  const companyNames = new Set<string>();
  const jobTitles = new Set<string>();
  const technologies = new Set<string>();
  const metrics = new Set<string>();
  const properNouns = new Set<string>();
  
  let allText = '';

  // Extract from Experience
  profile.experience.data.forEach(exp => {
    if (exp.companyName) companyNames.add(exp.companyName.toLowerCase());
    if (exp.roleTitle) jobTitles.add(exp.roleTitle.toLowerCase());
    
    exp.bullets.forEach(bullet => {
      allText += ` ${bullet.text}`;
      extractMetrics(bullet.text).forEach(m => metrics.add(m));
      extractProperNouns(bullet.text).forEach(p => properNouns.add(p.toLowerCase()));
    });
  });

  // Extract from Projects
  profile.projects.data.forEach(proj => {
    if (proj.name) properNouns.add(proj.name.toLowerCase());
    if (proj.role) jobTitles.add(proj.role.toLowerCase());
    
    proj.bullets.forEach(bullet => {
      allText += ` ${bullet.text}`;
      extractMetrics(bullet.text).forEach(m => metrics.add(m));
      extractProperNouns(bullet.text).forEach(p => properNouns.add(p.toLowerCase()));
    });
  });

  // Extract from Education
  profile.education.data.forEach(edu => {
    if (edu.institution) properNouns.add(edu.institution.toLowerCase());
    if (edu.degree) properNouns.add(edu.degree.toLowerCase());
  });

  // Extract from Skills
  profile.skills.data.forEach(skill => {
    technologies.add(skill.name.toLowerCase());
    properNouns.add(skill.name.toLowerCase());
    allText += ` ${skill.name}`;
  });

  // Extract from Summary
  if (profile.summary.data) {
    allText += ` ${profile.summary.data}`;
    extractMetrics(profile.summary.data).forEach(m => metrics.add(m));
    extractProperNouns(profile.summary.data).forEach(p => properNouns.add(p.toLowerCase()));
  }

  return {
    companyNames,
    jobTitles,
    technologies,
    metrics,
    properNouns,
    allText: allText.toLowerCase(),
  };
}

/**
 * Extracts numbers, percentages, currency, and "X+" formats.
 */
function extractMetrics(text: string): string[] {
  const metricRegex = /\b(?:\$|€|£)?\d+(?:,\d{3})*(?:\.\d+)?(?:%|[a-zA-Z]*\+?|\+)?\b/g;
  const matches = text.match(metricRegex);
  return matches ? matches.map(m => m.toLowerCase()) : [];
}

/**
 * Extracts capitalized words that don't appear at the very start of a sentence.
 * This is a simple heuristic for proper nouns.
 */
function extractProperNouns(text: string): string[] {
  // Split into sentences first
  const sentences = text.split(/[.!?]\s+/);
  const nouns: string[] = [];

  sentences.forEach(sentence => {
    // Find capitalized words that are not the first word of the sentence
    const words = sentence.trim().split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const word = words[i].replace(/[^a-zA-Z0-9-]/g, '');
      if (word && /^[A-Z][a-z0-9]*/.test(word)) {
        nouns.push(word);
      }
    }
  });

  return nouns;
}
