/**
 * A narrow literal review signal using Unicode tokens, not an entailment check.
 * It detects a single cited passage repeated at the start of a bullet with at
 * least one new token appended. It never edits or blocks candidate wording.
 * It misses insertions, paraphrased prefixes and many semantic changes; it can
 * flag harmless additions, changed inflections and source-supported meaning.
 * Token boundaries vary by language; unspaced scripts may be under-detected.
 */
const tokens = (text: string): string[] => text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];

export function appendedWordingNeedsReview(text: string, citedPassages: readonly string[]): boolean {
  // Avoid presenting a multi-source synthesis as if one source were complete.
  if (citedPassages.length !== 1) return false;
  const source = tokens(citedPassages[0]), proposed = tokens(text);
  if (source.length < 4 || proposed.length <= source.length) return false;
  if (!source.every((word, index) => proposed[index] === word)) return false;
  const sourceWords = new Set(source);
  return proposed.slice(source.length).some(word => !sourceWords.has(word));
}
