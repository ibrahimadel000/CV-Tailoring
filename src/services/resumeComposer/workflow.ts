import { v4 as uuid } from 'uuid';
import { cvProfileSchema, type CVProfile } from '@/types/schema';
import { professionalContent, CompositionError } from './core';
import { compileNaturalComposition, naturalDocumentSchema, prepareNaturalComposition, type NaturalPacket } from './naturalDocument';
import { summaryBoundaryNotice } from './summaryBoundary';
import { summarizeChanges, summarizeProposal } from './changeSummary';

// Adapter owns the network boundary. This core has no API key, fetch or automatic retry.
export type ComposeProvider = (packet: NaturalPacket, signal: AbortSignal) => Promise<unknown>;
export type Repository = {
  readActive(): CVProfile | undefined;
  // Synchronous compare-and-append. Persistence is a separate, observable boundary.
  appendIfCurrent(snapshot: string, copy: CVProfile): boolean;
};

const IMPORTED_DETAILS_TITLE = 'imported details';

function stripImportStagingSections(profile: CVProfile): void {
  if (!profile.customSections?.length) return;
  const removedIds = new Set<string>();
  profile.customSections = profile.customSections.filter(section => {
    const isStaging = section.title.trim().toLowerCase() === IMPORTED_DETAILS_TITLE;
    if (isStaging) removedIds.add(`custom:${section.id}`);
    return !isStaging;
  });
  if (removedIds.size && profile.sectionOrder?.length) {
    profile.sectionOrder = profile.sectionOrder.filter(id => !removedIds.has(id));
  }
}

export function createCompositionRunner(repository: Repository, provider: ComposeProvider) {
  let current: AbortController | undefined;
  // Keep runner occupied until the underlying provider promise settles so a
  // second request can never overlap a cancelling first request.
  let inFlightProvider: Promise<void> | undefined;

  const cancellable = (task: Promise<unknown>, signal: AbortSignal) => new Promise<unknown>((resolve, reject) => {
    const cancelled = () => { signal.removeEventListener('abort', cancelled); reject(new CompositionError('cancelled', 'Composition cancelled; nothing was saved.')); };
    // Always observe late provider rejection even if cancellation already won.
    task.then(value => { signal.removeEventListener('abort', cancelled); resolve(value); }, error => { signal.removeEventListener('abort', cancelled); reject(error); });
    if (signal.aborted) cancelled(); else signal.addEventListener('abort', cancelled, { once: true });
  });

  return {
    cancel() {
      current?.abort();
      current = undefined;
    },
    isBusy() {
      return Boolean(current || inFlightProvider);
    },
    async run(job: string, signal: AbortSignal) {
      if (current || inFlightProvider) throw new CompositionError('input', 'A composition is already running.');
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
        let providerTask: Promise<unknown>;
        try {
          providerTask = Promise.resolve(provider(packet, token.signal));
        } catch (syncErr) {
          providerTask = Promise.reject(syncErr);
        }
        const tracked = providerTask.then(() => undefined, () => undefined);
        inFlightProvider = tracked;
        tracked.finally(() => {
          if (inFlightProvider === tracked) inFlightProvider = undefined;
        });
        const response = await cancellable(providerTask, token.signal); // Exactly one invocation.
        ensureCurrent();
        const result = compileNaturalComposition(profile, response, packet.job);
        // Compilation already validates the response. Retain counts only, not
        // raw provider content, to distinguish AI wording from later checks.
        const proposalComparison = summarizeProposal(packet.source, naturalDocumentSchema.parse(response));
        const changes = summarizeChanges(profile, result.candidate);
        const narrativeUnchanged =
          changes.summary === 'unchanged' &&
          (changes.experience === 'unchanged' || changes.experience === 'empty') &&
          (changes.projects === 'unchanged' || changes.projects === 'empty');
        const categoryOnlySkillShuffle =
          narrativeUnchanged && changes.skills.excluded.length === 0 && !changes.skills.reordered && changes.skills.added === 0;
        if (professionalContent(result.candidate) === professionalContent(profile) || categoryOnlySkillShuffle) {
          return { ...result, proposalComparison, candidate: profile, status: 'unchanged' as const, profileId: profile.profileId };
        }
        const copy = result.candidate;
        stripImportStagingSections(copy);
        copy.compositionChanges = changes;
        copy.compositionChanges.proposal = proposalComparison;
        copy.profileId = uuid(); copy.baseProfileId = profile.profileId;
        copy.profileName = `${profile.profileName} — Tailored`;
        copy.targetJob = packet.job; copy.version = profile.version + 1; copy.lastConfirmed = '';
        const notes = [...new Set([...(profile.compositionReview?.notes ?? []),
          ...result.warnings.map(w => `${w.path}: ${w.message}`), ...result.normalizations.map(n => n.reason)])];
        const notice = summaryBoundaryNotice(result.summaryRemovals.length, result.summarySegments.length);
        if (notes.length) copy.compositionReview = { text: [notice, 'Some content needs your review; open the notes for details.'].filter(Boolean).join(' '), notes };
        else delete copy.compositionReview;
        delete copy.tailoring; delete copy.matchScore; delete copy.importedFrom;
        cvProfileSchema.parse(copy);
        ensureCurrent();
        if (!repository.appendIfCurrent(snapshot, copy)) throw new CompositionError('stale', 'Source changed at commit; nothing was saved.');
        return { ...result, proposalComparison, status: 'created' as const, profileId: copy.profileId };
      } finally { signal.removeEventListener('abort', abort); if (current === token) current = undefined; }
    },
  };
}
