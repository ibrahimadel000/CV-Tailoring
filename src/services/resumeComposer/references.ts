/** Reference namespaces are not semantic proof. Identity facts are derived, never model-authored. */
import type { Source } from '../contentEngine/engine';
const PREFIX = 'entrymeta:';
export const isEntryMetadata = (id: string) => id.startsWith(PREFIX);
export function withEntryMetadata(input: Source): Source {
  const source: Source = JSON.parse(JSON.stringify(input));
  const entries = [...source.experience, ...source.projects];
  const expected = entries.flatMap(e => (['title', 'organization', 'dates'] as const).flatMap(field => {
    const text = e[field].trim();
    return text ? [{ id: `${PREFIX}${e.id}:${field}`, kind: 'context' as const, parent: e.id, text }] : [];
  }));
  for (const fact of source.evidence.filter(f => isEntryMetadata(f.id))) {
    const match = expected.find(e => e.id === fact.id);
    if (!match || match.text !== fact.text || match.parent !== fact.parent || match.kind !== fact.kind || fact.profileCategory !== undefined) throw Error('Reserved entry metadata does not match the source identity.');
  }
  for (const fact of expected) if (!source.evidence.some(e => e.id === fact.id)) source.evidence.push(fact);
  if (source.evidence.length > 500) throw Error('Source plus explicit identity facts exceeds the evidence budget. Nothing was sent.');
  return source;
}
export function referencePolicy(source: Source) {
  const entries = [...source.experience.filter(() => !source.locks.experience), ...source.projects.filter(() => !source.locks.projects)];
  return {
    entityIdsAreNotCitations: true,
    summarySourceIds: source.evidence.map(f => f.id),
    entries: entries.map(e => ({
      entryId: e.id,
      identitySourceIds: source.evidence.filter(f => f.parent === e.id && isEntryMetadata(f.id)).map(f => f.id),
      overviewMode: e.overviewId ? 'existing' as const : 'empty' as const,
      overviewSourceIds: e.overviewId ? source.evidence.filter(f => f.parent === e.id).map(f => f.id) : [],
      bulletSourceIds: source.evidence.filter(f => f.parent === e.id && !isEntryMetadata(f.id)).map(f => f.id),
    })),
    skillIds: source.locks.skills ? [] : [...source.skillIds],
  };
}
// Schema enums prevent an entry ID such as work_1 from being generated as a citation.
// Same-entry ownership, completeness, locks and meaning still require separate checks.
export function boundCompositionContract(source: Source) {
  const policy = referencePolicy(source);
  const ref = { type: 'string', minLength: 1, maxLength: 100 };
  const list = (ids: string[], limit: number) => ({ type: 'array', items: ids.length ? { ...ref, enum: [...new Set(ids)] } : ref, maxItems: ids.length ? limit : 0 });
  const passage = (ids: string[], locked = false) => ({ type: 'object', properties: { text: { type: 'string', maxLength: locked ? 0 : 2400, ...(locked ? { enum: [''] } : {}) }, sourceIds: list(locked ? [] : ids, 24) }, required: ['text', 'sourceIds'], additionalProperties: false });
  const overviewIds = policy.entries.flatMap(e => e.overviewSourceIds), bulletIds = policy.entries.flatMap(e => e.bulletSourceIds);
  return {
    type: 'object', properties: {
      summary: passage(policy.summarySourceIds, source.locks.summary),
      entries: {
        type: 'array', minItems: policy.entries.length, maxItems: policy.entries.length,
        items: { type: 'object', properties: {
          id: policy.entries.length ? { ...ref, enum: policy.entries.map(e => e.entryId) } : ref,
          overview: passage(overviewIds, !policy.entries.some(e => e.overviewMode === 'existing')), bullets: { type: 'array', items: passage(bulletIds), maxItems: 40 },
        }, required: ['id', 'overview', 'bullets'], additionalProperties: false },
      },
      skillIds: list(policy.skillIds, 200),
    }, required: ['summary', 'entries', 'skillIds'], additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  };
}
