import type { CVProfile } from '@/types/schema';

/**
 * Translates internal guard/compiler paths (e.g. "entries.work_1.bullets.2: ...",
 * "summarySegments.0: ...", "skillSelections: ...") into calm, human-friendly copy
 * while leaving stored workflow review notes intact for diagnostics and tests.
 */
export function formatReviewNote(rawNote: string, profile?: CVProfile): string {
  const trimmed = rawNote.trim();
  if (!trimmed) return '';

  const colonIdx = trimmed.indexOf(': ');
  if (colonIdx <= 0) return trimmed;

  const rawPath = trimmed.slice(0, colonIdx).trim();
  const body = trimmed.slice(colonIdx + 2).trim();

  if (/^summarySegments(?:\.\d+)?$/i.test(rawPath) || rawPath === 'summary') {
    return `Profile: ${body}`;
  }
  if (rawPath === 'skillSelections' || rawPath === 'skills') {
    return `Skills: ${body}`;
  }

  const workMatch = /^entries\.work_(\d+)(?:\.(?:bullets\.\d+|overview))?$/i.exec(rawPath);
  if (workMatch) {
    const idx = Number(workMatch[1]) - 1;
    const entry = profile?.experience.data[idx];
    const label =
      [entry?.roleTitle?.trim(), entry?.companyName?.trim()].filter(Boolean).join(' · ') ||
      `Role #${workMatch[1]}`;
    // Avoid duplicating the entry prefix if the guard message already starts with it.
    if (label && body.toLowerCase().startsWith(label.toLowerCase())) return body;
    return `Experience (${label}): ${body}`;
  }

  const projMatch = /^entries\.project_(\d+)(?:\.(?:bullets\.\d+|overview))?$/i.exec(rawPath);
  if (projMatch) {
    const idx = Number(projMatch[1]) - 1;
    const entry = profile?.projects.data[idx];
    const label = entry?.name?.trim() || `Project #${projMatch[1]}`;
    if (label && body.toLowerCase().startsWith(label.toLowerCase())) return body;
    return `Projects (${label}): ${body}`;
  }

  return trimmed;
}
