import { v4 as uuid } from 'uuid';

// Version 2 deliberately retains the entire v1 store. Legacy applications open
// the latest version without specifying a version and continue to write there.
const DB = 'keyval-store', LEGACY = 'keyval', CANONICAL = 'cv-tailor-canonical-v1', RECORD = 'workspace';
const keys = ['cv-tailor-profiles-v2', 'cv-tailor-active-id-v2', 'cv-tailor-builder-theme-v1'] as const;
type Stored = [unknown, unknown, unknown];
type RecordV1 = { format: 1; revision: string; values: Stored };
export type StorageNotice = 'blocked' | 'invalidated';
export class StorageConflictError extends Error {
  constructor() { super('The saved workspace changed in another tab.'); this.name = 'StorageConflictError'; }
}
export class StorageGraphError extends Error {
  constructor() { super('This edit cannot safely preserve the saved structured data.'); this.name = 'StorageGraphError'; }
}

// The topology guard is deliberately conservative, not a general graph merge.
// When the baseline has shared references, reject structural changes that cannot
// be matched safely by stable IDs. IndexedDB itself performs structured cloning.
function graphChildren(value: object): [unknown, unknown][] | undefined {
  if (value instanceof Map) return [...value.entries()].flatMap(([k, v], i) => [[`k${i}`, k], [`v${i}`, v]]);
  if (value instanceof Set) return [...value].map((v, i) => [i, v]);
  if (ArrayBuffer.isView(value)) return [['buffer', value.buffer]];
  if (value instanceof Date || value instanceof RegExp || value instanceof ArrayBuffer) return [];
  if (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype) {
    return Object.keys(value).map(k => [k, (value as Record<string, unknown>)[k]]);
  }
  return undefined;
}
function supportedGraph(root: unknown): void {
  const seen = new Set<object>(), pending: unknown[] = [root];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    const children = graphChildren(value);
    if (!children) throw new StorageGraphError();
    for (const [, child] of children) pending.push(child);
  }
}
function assertTopology(before: unknown, after: unknown): void {
  const forward = new Map<object, object>(), reverse = new Map<object, object>();
  const pending: [unknown, unknown][] = [[before, after]];
  while (pending.length) {
    const [a, b] = pending.pop()!;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') continue;
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) continue; // An intentionally replaced value.
    if (forward.has(a) || reverse.has(b)) {
      if (forward.get(a) !== b || reverse.get(b) !== a) throw new StorageGraphError();
      continue;
    }
    forward.set(a, b); reverse.set(b, a);
    const ac = graphChildren(a), bc = graphChildren(b);
    if (!ac || !bc) throw new StorageGraphError();
    const next = new Map(bc);
    for (const [key, value] of ac) if (next.has(key)) pending.push([value, next.get(key)]);
  }
}
function hasSharedReferences(root: unknown): boolean {
  const seen = new Set<object>(), pending: unknown[] = [root];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    if (seen.has(value)) return true;
    seen.add(value);
    const children = graphChildren(value);
    if (!children) throw new StorageGraphError();
    for (const [, child] of children) pending.push(child);
  }
  return false;
}
// With a shared baseline, index-based matching alone can miss a split after
// array movement or removal. Reject ambiguous structural changes, except the
// explicitly requested snapshot deletion. This may reject legitimate edits.
function assertStableSharedStructure(before: unknown, after: unknown): void {
  const seen = new Map<object, object>(), pending: [unknown, unknown, boolean][] = [[before, after, true]];
  while (pending.length) {
    const [a, b, root] = pending.pop()!;
    if (!a || typeof a !== 'object') continue;
    if (!b || typeof b !== 'object' || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) throw new StorageGraphError();
    if (seen.has(a)) { if (seen.get(a) !== b) throw new StorageGraphError(); continue; }
    seen.set(a, b);
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) throw new StorageGraphError();
      if (!root) {
        const ids = new Set<string>();
        for (let i = 0; i < a.length; i++) {
          if (!a[i] || typeof a[i] !== 'object') continue;
          const id = a[i].profileId ?? a[i].id;
          if (typeof id !== 'string' || !b[i] || (b[i].profileId ?? b[i].id) !== id || ids.has(id)) throw new StorageGraphError();
          ids.add(id);
        }
      }
    }
    const ac = graphChildren(a), bc = graphChildren(b);
    if (!ac || !bc) throw new StorageGraphError();
    const next = new Map(bc);
    for (const [key, value] of ac) {
      if (!next.has(key)) {
        if (key === 'compositionSnapshot' && typeof (a as {profileId?: unknown}).profileId === 'string') continue;
        throw new StorageGraphError();
      }
      pending.push([value, next.get(key), false]);
    }
  }
}
function validRecord(value: unknown): value is RecordV1 {
  if (!value || typeof value !== 'object') return false;
  const r = value as RecordV1;
  return r.format === 1 && typeof r.revision === 'string' && r.revision.length > 0 && Array.isArray(r.values) && r.values.length === 3;
}

export class ProfileStorage {
  private db: IDBDatabase | undefined;
  private opening: Promise<IDBDatabase> | undefined;
  private baseline: RecordV1 | undefined;
  private invalidated = false;
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Set<(notice: StorageNotice) => void>();
  private notice: StorageNotice | undefined;
  subscribe(listener: (notice: StorageNotice) => void) { this.listeners.add(listener); if (this.notice) listener(this.notice); return () => { this.listeners.delete(listener); }; }
  private notify(notice: StorageNotice) { this.notice = notice; this.listeners.forEach(listener => listener(notice)); }

  private open(): Promise<IDBDatabase> {
    if (this.invalidated) return Promise.reject(new Error('Storage connection changed.'));
    if (this.db) return Promise.resolve(this.db);
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 2);
      request.onblocked = () => this.notify('blocked');
      request.onupgradeneeded = event => {
        const db = request.result, tx = request.transaction!;
        try {
          if (event.oldVersion === 0) db.createObjectStore(LEGACY);
          else if (event.oldVersion !== 1 || !db.objectStoreNames.contains(LEGACY)) throw new Error('Unexpected legacy database.');
          const canonical = db.createObjectStore(CANONICAL);
          const legacy = tx.objectStore(LEGACY);
          const reads = keys.map(key => legacy.get(key));
          let remaining = reads.length;
          for (const read of reads) read.onsuccess = () => {
            if (--remaining) return;
            try {
              // Migration and schema creation commit or roll back together.
              canonical.put({ format: 1, revision: uuid(), values: reads.map(r => r.result) }, RECORD);
            } catch { tx.abort(); }
          };
        } catch { tx.abort(); }
      };
      request.onerror = () => reject(request.error ?? new Error('Storage migration failed.'));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CANONICAL) || !db.objectStoreNames.contains(LEGACY)) { db.close(); reject(new Error('Storage stores missing.')); return; }
        this.db = db;
        this.notice = undefined;
        const invalidate = () => { db.close(); this.db = undefined; this.invalidated = true; this.notify('invalidated'); };
        db.onversionchange = invalidate;
        db.onclose = invalidate;
        resolve(db);
      };
    });
    return this.opening;
  }

  async load(): Promise<Stored> {
    const db = await this.open();
    const record = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(CANONICAL, 'readonly'), request = tx.objectStore(CANONICAL).get(RECORD);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Storage read failed.'));
    });
    if (!validRecord(record)) throw new Error('Saved workspace record is missing or unsupported.');
    supportedGraph(record.values);
    this.baseline = structuredClone(record);
    return record.values;
  }

  save(profiles: unknown, activeId: unknown, theme: unknown): Promise<void> {
    let next: RecordV1;
    try {
      next = structuredClone({ format: 1 as const, revision: uuid(), values: [profiles, activeId, theme] as Stored });
      supportedGraph(next.values);
    } catch (error) { return Promise.reject(error); }
    const work = this.queue.then(() => this.commit(next));
    this.queue = work.catch(() => {});
    return work;
  }
  private async commit(next: RecordV1): Promise<void> {
    const baseline = this.baseline;
    if (!baseline || this.invalidated || !this.db) throw new Error('Workspace is not available; saving is disabled.');
    if (hasSharedReferences(baseline.values)) assertStableSharedStructure(baseline.values, next.values);
    assertTopology(baseline.values, next.values);
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(CANONICAL, 'readwrite'), store = tx.objectStore(CANONICAL);
      let failure: unknown;
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('Storage write failed.'));
      try {
        const request = store.get(RECORD);
        request.onsuccess = () => {
          try {
            if (!validRecord(request.result)) throw new Error('Saved workspace record is missing or unsupported.');
            if (request.result.revision !== baseline.revision) throw new StorageConflictError();
            store.put(next, RECORD);
          } catch (error) { failure = error; tx.abort(); }
        };
      } catch (error) { failure = error; tx.abort(); }
    });
    this.baseline = next;
  }
}
