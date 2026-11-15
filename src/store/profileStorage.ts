import { createStore, type UseStore } from 'idb-keyval';
import { v4 as uuid } from 'uuid';

const keys = ['cv-tailor-profiles-v2', 'cv-tailor-active-id-v2', 'cv-tailor-builder-theme-v1', 'cv-tailor-revision-v1'] as const;
type Stored = [unknown, unknown, unknown, unknown];
export class StorageConflictError extends Error {
  constructor() { super('The saved workspace changed in another tab.'); this.name = 'StorageConflictError'; }
}

// Unknown/future metadata must never compare equal merely because JSON omits it.
// Unsupported structured-clone values fail closed instead of risking an overwrite.
export function sameStoredValue(a: unknown, b: unknown, seen = new Map<object, object>(), reverse = new Map<object, object>()): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (seen.has(a) || reverse.has(b)) return seen.get(a) === b && reverse.get(b) === a;
  seen.set(a, b); reverse.set(b, a);
  if (a instanceof Date && b instanceof Date) return Object.is(a.getTime(), b.getTime());
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) return sameBytes(new Uint8Array(a), new Uint8Array(b));
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) return a.constructor === b.constructor && a.byteOffset === b.byteOffset && a.byteLength === b.byteLength && sameStoredValue(a.buffer, b.buffer, seen, reverse);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return false;
  if (!Array.isArray(a) && (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype)) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length || ak.some(k => !Object.prototype.hasOwnProperty.call(b, k))) return false;
  return ak.every(k => sameStoredValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], seen, reverse));
}
function sameBytes(a: Uint8Array, b: Uint8Array) { return a.length === b.length && a.every((v, i) => v === b[i]); }

// All keys and the opaque revision are read/written in a single IDB transaction.
// Comparing raw data as well catches a legacy writer that did not update revision.
export class ProfileStorage {
  private baseline: Stored | undefined;
  private queue: Promise<void> = Promise.resolve();
  constructor(private store: UseStore = createStore('keyval-store', 'keyval')) {}

  async load(): Promise<Stored> {
    const values = await this.store('readonly', store => new Promise<Stored>((resolve, reject) => {
      const requests = keys.map(key => store.get(key));
      store.transaction.oncomplete = () => resolve(requests.map(r => r.result) as Stored);
      store.transaction.onabort = store.transaction.onerror = () => reject(store.transaction.error ?? new Error('Storage read failed.'));
    }));
    this.baseline = structuredClone(values);
    return values;
  }

  save(profiles: unknown, activeId: unknown, theme: unknown): Promise<void> {
    // Capture at invocation, so later UI edits cannot mutate a queued write.
    const next: Stored = structuredClone([profiles, activeId, theme, uuid()]);
    const work = this.queue.then(() => this.commit(next));
    this.queue = work.catch(() => {});
    return work;
  }

  private async commit(next: Stored): Promise<void> {
    const baseline = this.baseline;
    if (!baseline) throw new Error('Workspace was not loaded; saving is disabled.');
    await this.store('readwrite', store => new Promise<void>((resolve, reject) => {
      const tx = store.transaction;
      let failure: unknown;
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('Storage write failed.'));
      try {
        const requests = keys.map(key => store.get(key));
        let remaining = requests.length;
        for (const request of requests) request.onsuccess = () => {
          if (--remaining) return;
          try {
            const current = requests.map(r => r.result);
            if (!sameStoredValue(baseline, current)) throw new StorageConflictError();
            keys.forEach((key, index) => store.put(next[index], key));
          } catch (error) { failure = error; tx.abort(); }
        };
      } catch (error) { failure = error; tx.abort(); }
    }));
    this.baseline = next;
  }
}
