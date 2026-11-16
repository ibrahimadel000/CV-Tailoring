export const MAX_RESPONSE_BYTES = 512 * 1024;

export class BoundedResponseError extends Error {
  constructor(public readonly kind: 'oversized' | 'invalid', message: string) {
    super(message);
    this.name = 'BoundedResponseError';
  }
}

// AbortSignal does not guarantee that an adapter or response-body promise will
// settle. Resolve our own wait on abort and perform best-effort late cleanup.
export function awaitAbortable<T>(task: Promise<T>, signal: AbortSignal, onLateValue?: (value: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      fn();
    };
    const onAbort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')));
    task.then(value => {
      if (settled) {
        try { onLateValue?.(value); } catch { /* Best-effort late cleanup. */ }
      } else finish(() => resolve(value));
    }, error => finish(() => reject(error)));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
}

// A successful response must expose a readable stream. Falling back to
// response.json() would make the byte bound unverifiable for adapters and test
// doubles that hide the body behind an already-parsed promise.
export async function readBoundedJsonResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new BoundedResponseError('invalid', 'Successful response body is not readable.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  let finished = false;
  try {
    while (true) {
      const next = await awaitAbortable(reader.read(), signal, () => { void reader.cancel().catch(() => {}); });
      if (next.done) { finished = true; break; }
      size += next.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new BoundedResponseError('oversized', 'Successful response exceeded the byte limit.');
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new BoundedResponseError('invalid', 'Successful response was not valid JSON.'); }
  } finally {
    if (!finished) void reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch { /* A late read may still be settling. */ }
  }
}
