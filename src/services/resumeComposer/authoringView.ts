/** Joined source context for the one-pass writer, not a matcher or a verdict.
 * No new facts, target keywords, relevance ranking or output fields are created.
 * Original groups describe the source; they never establish employer/tool use.
 */
import type { Source } from '../contentEngine/engine';
export function buildAuthoringView(source: Source) {
  const facts = new Map(source.evidence.map(f => [f.id, f]));
  const skillSet = new Set(source.skillIds), contextualized = new Set<string>();
  const capabilities = (ids: readonly string[]) => ids.filter(id => skillSet.has(id)).map(id => {
    const fact = facts.get(id)!;
    return { id, text: fact.text };
  });
  const capabilityGroups = (source.originalSkillContexts || []).map(group => {
    const items = capabilities(group.skillIds);
    for (const item of items) contextualized.add(item.id);
    return { sectionTitle: group.sectionTitle, groupTitle: group.groupTitle, capabilities: items };
  }).filter(group => group.capabilities.length);
  return {
    contributionsByEntry: [
      ...source.experience.map(entry => ({ entry, locked: source.locks.experience, section: 'experience' })),
      ...source.projects.map(entry => ({ entry, locked: source.locks.projects, section: 'projects' })),
    ].map(({ entry, locked, section }) => ({
      entryId: entry.id, section, locked, title: entry.title, organization: entry.organization,
      contributions: [entry.overviewId, ...entry.bulletIds].filter(Boolean).map(id => {
        const fact = facts.get(id)!;
        return { id, kind: fact.kind, text: fact.text };
      }),
    })),
    capabilityGroups,
    ungroupedCapabilities: capabilities(source.skillIds.filter(id => !contextualized.has(id))),
    capabilityMeaning: 'Exact native listed capabilities and qualifications, not employer practice. Original section/group headings are source context, not prose to print or credentials to infer. Review all groups against the whole job, including supporting duties; keep materially relevant skills in native Skills. Locked skills are preserved, not reselected.',
    synthesisMeaning: 'Use complementary actual contributions to explain relevant background. The job selects emphasis; it does not establish candidate specialization, career focus, interests or experience. Do not turn a target title into candidate history or promote listed capabilities into work relationships.',
  };
}
