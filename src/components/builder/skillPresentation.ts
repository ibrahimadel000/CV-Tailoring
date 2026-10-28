import type { SkillTag } from '@/types/schema';

/** Presentation only: preserve native skills and use first visible occurrence
 * to order groups. Interleaved categories remain grouped; this is not a global
 * flat order and does not infer relevance, rename, merge or recategorize skills.
 */
export function orderedSkillGroups(skills: readonly SkillTag[]) {
  const groups = new Map<SkillTag['category'], SkillTag[]>();
  for (const skill of skills) {
    if (!skill.name.trim()) continue;
    const items = groups.get(skill.category);
    if (items) items.push(skill);
    else groups.set(skill.category, [skill]);
  }
  return [...groups].map(([category, items]) => ({
    category, title: category === 'Soft' ? 'Interpersonal' : category, items,
  }));
}
