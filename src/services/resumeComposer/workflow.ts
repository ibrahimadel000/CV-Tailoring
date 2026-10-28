import { v4 as uuid } from 'uuid';
import { cvProfileSchema, type CVProfile } from '@/types/schema';
import { professionalContent, CompositionError } from './core';
import { compileNaturalComposition, prepareNaturalComposition, type NaturalPacket } from './naturalDocument';

// Adapter owns the network boundary. This core has no API key, fetch or automatic retry.
export type ComposeProvider = (packet: NaturalPacket, signal: AbortSignal) => Promise<unknown>;
export type Repository = {
  readActive(): CVProfile | undefined;
  // Synchronous compare-and-append. Persistence is a separate, observable boundary.
  appendIfCurrent(snapshot: string, copy: CVProfile): boolean;
};
export function createCompositionRunner(repository: Repository, provider: ComposeProvider) {
  let current: AbortController | undefined;
  const cancellable = (task: Promise<unknown>, signal: AbortSignal) => new Promise<unknown>((resolve, reject) => {
    const cancelled = () => { signal.removeEventListener('abort', cancelled); reject(new CompositionError('cancelled', 'Composition cancelled; nothing was saved.')); };
    // Always observe late provider rejection even if cancellation already won.
    task.then(value => { signal.removeEventListener('abort', cancelled); resolve(value); }, error => { signal.removeEventListener('abort', cancelled); reject(error); });
    if (signal.aborted) cancelled(); else signal.addEventListener('abort', cancelled, { once: true });
  });
  return {
    cancel() { current?.abort(); current = undefined; },
    async run(job: string, signal: AbortSignal) {
      if (current) throw new CompositionError('input', 'A composition is already running.');
      const original = repository.readActive();
      if (!original) throw new CompositionError('input', 'No active resume.');
      const snapshot = JSON.stringify(original), profile: CVProfile = JSON.parse(snapshot);
      const packet = prepareNaturalComposition(profile, job), token = new AbortController(); current = token;
      const abort = () => token.abort();
      signal.addEventListener('abort', abort, { once: true });
      const ensureCurrent = () => {
        if (signal.aborted || token.signal.aborted || current !== token) throw new CompositionError('cancelled', 'Composition cancelled; nothing was saved.');
        if (JSON.stringify(repository.readActive()) !== snapshot) throw new CompositionError('stale', 'The active resume changed; nothing was saved.');
      };
      try {
        ensureCurrent();
        const response = await cancellable(provider(packet, token.signal), token.signal); // Exactly one invocation.
        ensureCurrent();
        const result = compileNaturalComposition(profile, response);
        if (professionalContent(result.candidate) === professionalContent(profile)) {
          // Keeping already-good wording is a valid outcome, not an AI failure.
          return { ...result, candidate: profile, status: 'unchanged' as const, profileId: profile.profileId };
        }
        const copy = result.candidate;
        copy.profileId = uuid(); copy.baseProfileId = profile.profileId;
        copy.profileName = `${profile.profileName} — Tailored`;
        copy.targetJob = packet.job; copy.version = profile.version + 1; copy.lastConfirmed = '';
        // Do not mislabel a new engine output as an old, reviewed/verified result.
        delete copy.tailoring; delete copy.matchScore;
        cvProfileSchema.parse(copy);
        ensureCurrent();
        if (!repository.appendIfCurrent(snapshot, copy)) throw new CompositionError('stale', 'Source changed at commit; nothing was saved.');
        return { ...result, status: 'created' as const, profileId: copy.profileId };
      } finally { signal.removeEventListener('abort', abort); if (current === token) current = undefined; }
    },
  };
}
