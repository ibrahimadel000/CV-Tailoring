// JSON is only offered when it can represent the current graph without dropping
// values or identity. No import/restore facility is implied by this download.
export function recoveryJson(value: unknown): string {
  const seen = new Set<object>(), pending: unknown[] = [value];
  while (pending.length) {
    const v = pending.pop();
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0))) continue;
    if (typeof v !== 'object' || seen.has(v)) throw new Error('Not losslessly representable as JSON');
    seen.add(v);
    if (Object.getOwnPropertySymbols(v).length) throw new Error('Not losslessly representable as JSON');
    const ownNames = Object.getOwnPropertyNames(v);
    if (ownNames.length !== Object.keys(v).length + (Array.isArray(v) ? 1 : 0)) throw new Error('Not losslessly representable as JSON');
    if (Array.isArray(v)) {
      const keys = Object.keys(v);
      if (keys.length !== v.length || keys.some((k, i) => k !== String(i))) throw new Error('Not losslessly representable as JSON');
    } else if (Object.getPrototypeOf(v) !== Object.prototype) throw new Error('Not losslessly representable as JSON');
    for (const key of Object.keys(v)) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!descriptor || !('value' in descriptor)) throw new Error('Not losslessly representable as JSON');
      pending.push(descriptor.value);
    }
  }
  return JSON.stringify(value, null, 2);
}
