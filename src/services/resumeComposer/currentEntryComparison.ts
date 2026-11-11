/** Pair current entries by unambiguous native identity, never by text or title.
 * This is a live comparison, not a generation-time snapshot or a semantic diff.
 */
type Identified = { id: string };
export type EntryPair<T> = { source?: T; copy?: T; match: 'matched' | 'source-only' | 'copy-only' | 'ambiguous' };
export function pairCurrentEntries<T extends Identified>(source: readonly T[], copy: readonly T[]): EntryPair<T>[] {
  const count = (entries: readonly T[]) => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
    return counts;
  };
  const sourceCounts = count(source), copyCounts = count(copy);
  const copyById = new Map(copy.map(entry => [entry.id, entry]));
  const paired = new Set<string>();
  const result: EntryPair<T>[] = source.map(entry => {
    const sourceCount = sourceCounts.get(entry.id) ?? 0, copyCount = copyCounts.get(entry.id) ?? 0;
    if (sourceCount === 1 && copyCount === 1) {
      paired.add(entry.id);
      return { source: entry, copy: copyById.get(entry.id)!, match: 'matched' };
    }
    return { source: entry, match: sourceCount > 1 || copyCount > 1 ? 'ambiguous' : 'source-only' };
  });
  for (const entry of copy) if (!paired.has(entry.id)) {
    const ambiguous = (sourceCounts.get(entry.id) ?? 0) > 1 || (copyCounts.get(entry.id) ?? 0) > 1;
    result.push({ copy: entry, match: ambiguous ? 'ambiguous' : 'copy-only' });
  }
  return result;
}
/** Presence of literal text among the counterpart's current bullets only.
 * Duplicates are presence-based; this is not a one-to-one mapping or semantic test.
 */
export function hasExactBullet(text: string, bullets: readonly { text: string }[]): boolean {
  return bullets.some(b => b.text === text);
}
