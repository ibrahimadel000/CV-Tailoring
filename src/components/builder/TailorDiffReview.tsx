import { diffWords } from 'diff';
import { RotateCcw, Plus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { CVProfile, SkillTag } from '@/types/schema';

function WordDiff({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);
  return (
    <span className="diff-text">
      {parts.map((part, idx) =>
        part.added ? (
          <ins key={idx} className="diff-added">{part.value}</ins>
        ) : part.removed ? (
          <del key={idx} className="diff-removed">{part.value}</del>
        ) : (
          <span key={idx}>{part.value}</span>
        ),
      )}
    </span>
  );
}

export function TailorDiffReview({ active, source }: { active: CVProfile; source: CVProfile }) {
  const updateSummary = useAppStore(s => s.updateSummary);
  const updateExperience = useAppStore(s => s.updateExperience);

  const summaryBefore = source.summary.data.trim();
  const summaryAfter = active.summary.data.trim();
  const summaryChanged = summaryBefore !== summaryAfter;

  const restoreSkill = (skillName: string) => {
    const match = source.skills.data.find(
      s => s.name.trim().toLowerCase() === skillName.trim().toLowerCase(),
    );
    if (!match) return;
    useAppStore.setState(state => ({
      profiles: state.profiles.map(p => {
        if (p.profileId !== active.profileId) return p;
        const alreadyPresent = p.skills.data.some(
          s => s.name.trim().toLowerCase() === match.name.trim().toLowerCase(),
        );
        if (alreadyPresent) return p;
        const restored: SkillTag = { ...match };
        return {
          ...p,
          skills: { ...p.skills, data: [...p.skills.data, restored] },
        };
      }),
    }));
  };

  const revertBullet = (entryId: string, bulletId: string, originalText: string) => {
    const entry = active.experience.data.find(e => e.id === entryId);
    if (!entry) return;
    updateExperience(entryId, {
      bullets: entry.bullets.map(b => (b.id === bulletId ? { ...b, text: originalText } : b)),
    });
  };

  const activeSkillNames = new Set(active.skills.data.map(s => s.name.trim().toLowerCase()));
  const restorableExcluded = (active.compositionChanges?.skills.excluded ?? []).filter(
    s => !activeSkillNames.has(s.name.trim().toLowerCase()),
  );

  return (
    <div className="tailor-diff-review">
      <div className="diff-card">
        <div className="diff-header">
          <strong>Summary diff</strong>
          {summaryChanged && (
            <button
              type="button"
              className="text-button diff-action"
              onClick={() => updateSummary(source.summary.data)}
            >
              <RotateCcw size={13} /> Revert summary
            </button>
          )}
        </div>
        {summaryChanged ? (
          <p className="diff-body">
            <WordDiff before={summaryBefore} after={summaryAfter} />
          </p>
        ) : (
          <p className="diff-unchanged">Matches original summary.</p>
        )}
      </div>

      {active.experience.data.map(entry => {
        const srcEntry = source.experience.data.find(e => e.id === entry.id);
        if (!srcEntry) return null;
        const srcBulletById = new Map(srcEntry.bullets.map(b => [b.id, b.text]));
        const changedBullets = entry.bullets
          .map(b => ({ bullet: b, original: srcBulletById.get(b.id) }))
          .filter(item => item.original !== undefined && item.original.trim() !== item.bullet.text.trim());
        const reordered =
          entry.bullets.map(b => b.id).join(',') !== srcEntry.bullets.map(b => b.id).join(',');

        return (
          <div key={entry.id} className="diff-card">
            <div className="diff-header">
              <strong>
                {entry.roleTitle}
                {entry.companyName ? ` · ${entry.companyName}` : ''}
              </strong>
              {reordered && <span className="diff-badge">Reordered</span>}
            </div>
            {changedBullets.length > 0 ? (
              <ul className="diff-list">
                {changedBullets.map(({ bullet, original }) => (
                  <li key={bullet.id} className="diff-item">
                    <WordDiff before={original!} after={bullet.text} />
                    <button
                      type="button"
                      className="text-button diff-action"
                      onClick={() => revertBullet(entry.id, bullet.id, original!)}
                    >
                      <RotateCcw size={12} /> Revert
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="diff-unchanged">
                {reordered ? 'Bullets reordered by relevance; wording matches original.' : 'Wording and order match original.'}
              </p>
            )}
          </div>
        );
      })}

      {restorableExcluded.length > 0 && (
        <div className="diff-card">
          <div className="diff-header">
            <strong>Omitted skills ({restorableExcluded.length})</strong>
          </div>
          <div className="diff-chips">
            {restorableExcluded.map((skill, idx) => (
              <button
                key={`${skill.name}-${idx}`}
                type="button"
                className="diff-chip"
                title={`Restore "${skill.name}" to this tailored copy`}
                onClick={() => restoreSkill(skill.name)}
              >
                <Plus size={12} /> {skill.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
