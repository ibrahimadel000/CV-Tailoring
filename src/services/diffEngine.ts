import { diffWords } from 'diff';
import type { DiffToken } from '@/types/schema';

/**
 * Normalizes punctuation before diffing to prevent compound words
 * (like CI/CD, auto-scaling) from fracturing mid-keystroke.
 */
function normalizeForDiff(text: string): string {
  if (!text) return '';
  return text.replace(/([\w])([-/])([\w])/g, '$1$2$3');
}

/**
 * Computes word-level diffs and maps jsdiff output to our internal DiffToken schema.
 */
export function computeWordDiff(original: string, modified: string): DiffToken[] {
  const normOriginal = normalizeForDiff(original);
  const normModified = normalizeForDiff(modified);

  const result = diffWords(normOriginal, normModified);

  return result.map(part => ({
    text: part.value,
    type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
  }));
}
