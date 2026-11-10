/** Retired SC4 output channel. Reject stale nonempty selections explicitly.
 * Capabilities stay in native Skills; never auto-append an inventory or raw
 * import headings to professional prose. No source qualifications are stripped.
 */
import type { Source } from '../contentEngine/engine';
import { CompositionError } from './core';
export const SUMMARY_CAPABILITY_MAX = 0;
export function renderSummaryCapabilities(_source: Source, ids: readonly string[], _selectedIds: readonly string[]) {
  if (ids.length) throw new CompositionError('contract', 'Automatic summary capability lists are retired. Keep selected capabilities in Skills. Nothing was saved.');
  return { text: '', sourceIds: [] as string[] };
}
