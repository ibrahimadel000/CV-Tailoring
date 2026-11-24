// Abortable, byte-capped HTTP response body readers.
// Ensures stalled response or error streams cannot hang past Stop or timeout.

export class BoundedResponseError extends Error {
  constructor(
    public readonly kind: 'aborted' | 'oversized' | 'invalid_json',
    message: string,
  ) {
    super(message);
    this.name = 'BoundedResponseError';
  }
}

function abortError(): BoundedResponseError {
  return new BoundedResponseError('aborted', 'Response reading was aborted.');
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal, onAbort?: () => void): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    onAbort?.();
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const handleAbort = () => {
      if (settled) return;
      settled = true;
      reject(abortError());
      onAbort?.();
    };
    signal.addEventListener('abort', handleAbort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', handleAbort);
        if (settled) return;
        settled = true;
        if (signal.aborted) reject(abortError());
        else resolve(value);
      },
      err => {
        signal.removeEventListener('abort', handleAbort);
        if (settled) return;
        settled = true;
        reject(signal.aborted ? abortError() : err);
      },
    );
  });
}

export async function readBoundedText(
  response: Response,
  signal: AbortSignal | undefined,
  maxBytes: number,
): Promise<string> {
  if (signal?.aborted) {
    await response.body?.cancel?.().catch(() => {});
    throw abortError();
  }

  const declared = response.headers?.get?.('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel?.().catch(() => {});
    throw new BoundedResponseError('oversized', `Response exceeded ${maxBytes} bytes.`);
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    if (typeof response.text !== 'function') return '';
    const text = await raceWithAbort(response.text(), signal);
    if (signal?.aborted) throw abortError();
    const byteLength = new TextEncoder().encode(text).byteLength;
    if (byteLength > maxBytes) {
      throw new BoundedResponseError('oversized', `Response exceeded ${maxBytes} bytes.`);
    }
    return text;
  }

  const cancelReader = () => {
    reader.cancel().catch(() => {});
  };

  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await raceWithAbort(reader.read(), signal, cancelReader);
      if (signal?.aborted) throw abortError();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        cancelReader();
        throw new BoundedResponseError('oversized', `Response exceeded ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* Reader may already be released after cancellation. */
    }
  }
}

export async function readBoundedJson(
  response: Response,
  signal: AbortSignal | undefined,
  maxBytes: number,
): Promise<unknown> {
  // Support lightweight mock Response objects in unit tests that implement only .json()
  if (!response.body && typeof response.text !== 'function' && typeof response.json === 'function') {
    const value = await raceWithAbort(response.json(), signal);
    if (signal?.aborted) throw abortError();
    return value;
  }
  const text = await readBoundedText(response, signal, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new BoundedResponseError('invalid_json', 'Response body is not valid JSON.');
  }
}
