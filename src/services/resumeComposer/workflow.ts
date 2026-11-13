import { v4 as uuid } from 'uuid';
import { cvProfileSchema, type CVProfile } from '@/types/schema';
import { professionalContent, CompositionError } from './core';
import { compileNaturalComposition, naturalDocumentSchema, prepareNaturalComposition, type NaturalPacket } from './naturalDocument';
import { summaryBoundaryNotice } from './summaryBoundary';
import { summarizeChanges, summarizeProposal } from './changeSummary';
import { assertExactSourceFits, exactSourceWording } from './exactSourceWording';

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
    const cancelled = () => { signal.removeEventListener('abort', cancelled); reject(new CompositionError('cancelled', 'Composition cancelled; nothing was saved. The provider may still have processed or charged the request.')); };
    // Always observe late provider rejection even if cancellation already won.
    task.then(value => { signal.removeEventListener('abort', cancelled); resolve(value); }, error => { signal.removeEventListener('abort', cancelled); reject(error); });
    if (signal.aborted) cancelled(); else signal.addEventListener('abort', cancelled, { once: true });
  });
  return {
    cancel() { current?.abort(); current = undefined; },
    // Opt-in keeps native wording; it does not validate the source or ordering.
    async run(job: string, signal: AbortSignal, options: { exactSourceWording?: boolean } = {}) {
      const keepSourceWording = options.exactSourceWording === true;
      if (current) throw new CompositionError('input', 'A composition is already running.');
      const original = repository.readActive();
      if (!original) throw new CompositionError('input', 'No active resume.');
      const snapshot = JSON.stringify(original), profile: CVProfile = JSON.parse(snapshot);
      const packet = prepareNaturalComposition(profile, job);
      if (keepSourceWording) assertExactSourceFits(packet.source);
      const token = new AbortController(); current = token;
      const abort = () => token.abort();
      signal.addEventListener('abort', abort, { once: true });
      const ensureCurrent = () => {
        if (signal.aborted || token.signal.aborted || current !== token) throw new CompositionError('cancelled', 'Composition cancelled; nothing was saved. The provider may still have processed or charged the request.');
        if (JSON.stringify(repository.readActive()) !== snapshot) throw new CompositionError('stale', 'The active resume changed; nothing was saved.');
      };
      try {
        ensureCurrent();
        const response = await cancellable(provider(packet, token.signal), token.signal); // Exactly one invocation.
        ensureCurrent();
        const compiled = compileNaturalComposition(profile, response, packet.job);
        // Compilation must succeed before the optional source-only projection.
        const parsed = naturalDocumentSchema.parse(response);
        const result = keepSourceWording ? exactSourceWording(profile, compiled, parsed) : compiled;
        // These are explicitly pre-check proposal counts, not copy changes.
        const proposalComparison = summarizeProposal(packet.source, parsed);
        if (professionalContent(result.candidate) === professionalContent(profile)) {
          // Keeping already-good wording is a valid outcome, not an AI failure.
          return { ...result, proposalComparison, candidate: profile, status: 'unchanged' as const, profileId: profile.profileId };
        }
        const copy = result.candidate;
        // Compare before copy metadata is changed. Kept locally, not sent to
        // the provider or embedded in the exported resume.
        copy.compositionChanges = summarizeChanges(profile, copy);
        if (!keepSourceWording) copy.compositionChanges.proposal = proposalComparison;
        copy.profileId = uuid(); copy.baseProfileId = profile.profileId;
        copy.profileName = `${profile.profileName} — Tailored`;
        copy.targetJob = packet.job; copy.version = profile.version + 1; copy.lastConfirmed = '';
        // Preserve unresolved historical notes when a tailored copy is tailored again.
        // They stay local to the profile and are not part of the provider packet or PDF.
        const notes = [...new Set([...(profile.compositionReview?.notes ?? []),
          ...result.warnings.map(w => `${w.path}: ${w.message}`), ...result.normalizations.map(n => n.reason)])];
        const notice = summaryBoundaryNotice(result.summaryRemovals.length, result.summarySegments.length);
        if (notes.length) copy.compositionReview = { text: [notice, 'Some content needs your review; open the notes for details.'].filter(Boolean).join(' '), notes };
        else delete copy.compositionReview;
        // Do not mislabel a new engine output as an old, reviewed/verified result.
        delete copy.tailoring; delete copy.matchScore;
        cvProfileSchema.parse(copy);
        ensureCurrent();
        if (!repository.appendIfCurrent(snapshot, copy)) throw new CompositionError('stale', 'Source changed at commit; nothing was saved.');
        return { ...result, proposalComparison, status: 'created' as const, profileId: copy.profileId };
      } finally { signal.removeEventListener('abort', abort); if (current === token) current = undefined; }
    },
  };
}
