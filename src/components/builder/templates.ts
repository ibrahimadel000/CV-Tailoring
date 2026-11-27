/**
 * Single-source template metadata map (adapted from Reactive Resume's templates.ts, MIT).
 * Drives template selection cards, filter chips, and ATS-safety labeling.
 */
import type { DocumentTheme } from '@/types/schema';

export type ActiveLayoutStyle = Exclude<DocumentTheme['layoutStyle'], 'split'>;

export interface ResumeTemplateMeta {
  id: ActiveLayoutStyle;
  name: string;
  note: string;
  font: DocumentTheme['fontFamily'];
  columns: 1 | 2;
  atsSafe: boolean;
  density: 'balanced' | 'editorial' | 'compact';
}

export const RESUME_TEMPLATES: readonly ResumeTemplateMeta[] = [
  {
    id: 'modern',
    name: 'Essential',
    note: 'Clear. Confident. Versatile.',
    font: 'sans',
    columns: 1,
    atsSafe: true,
    density: 'balanced',
  },
  {
    id: 'classic',
    name: 'Editorial',
    note: 'Timeless serif typography.',
    font: 'serif',
    columns: 1,
    atsSafe: true,
    density: 'editorial',
  },
  {
    id: 'minimal',
    name: 'Compact',
    note: 'More room for your story.',
    font: 'sans',
    columns: 1,
    atsSafe: true,
    density: 'compact',
  },
  {
    id: 'technical',
    name: 'Technical',
    note: 'Single-line entry headers for dense 1-page CVs.',
    font: 'sans',
    columns: 1,
    atsSafe: true,
    density: 'compact',
  },
  {
    id: 'executive',
    name: 'Executive',
    note: 'Framed contact bar with senior leadership hierarchy.',
    font: 'serif',
    columns: 1,
    atsSafe: true,
    density: 'editorial',
  },
] as const;

export function getTemplateMeta(layoutStyle: DocumentTheme['layoutStyle']): ResumeTemplateMeta {
  return RESUME_TEMPLATES.find(t => t.id === layoutStyle) ?? RESUME_TEMPLATES[0];
}
