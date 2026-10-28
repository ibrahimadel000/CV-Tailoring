// Narrow deterministic regression check, NOT a semantic verifier. Detects
// reassignment of numbers between recognizable clauses, without a synonym list.
const number = /[$€£]?\d+(?:[,.]\d+)*(?:\s?(?:%|[kKmMbB]\b|\+))?/g;
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660));
const stop = new Set('a an the and or by of for to in on with from at reduced reduce cut improved improve increased increase decreased decrease achieved delivered resulting through using while was were is are'.split(' '));
function clauses(text: string) {
  return normalize(text).split(/[;؛\n]|(?<=[.!?])\s+|\s+(?:and|while|whereas)\s+/u).map(text => ({
    values: (text.match(number) ?? []).map(n => n.replace(/\s/g, '')).sort(),
    words: new Set((text.replace(number, ' ').match(/[\p{L}][\p{L}+#]*/gu) ?? []).filter(w => w.length > 1 && !stop.has(w))),
  })).filter(c => c.values.length && c.words.size >= 2);
}
export function metricScopeIssue(before: string, after: string): boolean {
  const original = clauses(before), proposed = clauses(after);
  if (original.length < 2) return false;
  for (const part of proposed) {
    const matches = original.map(old => ({ old, score: [...part.words].filter(w => old.words.has(w)).length / Math.max(part.words.size, old.words.size) })).sort((a, b) => b.score - a.score);
    const best = matches[0];
    if (best && best.score >= 0.6 && best.score - (matches[1]?.score ?? 0) >= 0.2 && JSON.stringify(best.old.values) !== JSON.stringify(part.values)) return true;
  }
  return false;
}
