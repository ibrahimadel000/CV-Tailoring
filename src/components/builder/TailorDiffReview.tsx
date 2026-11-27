import { useMemo } from 'react';
import { diffWords } from 'diff';
import { RotateCcw, Plus, ArrowUpDown } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { BulletPoint, CVProfile, SkillTag } from '@/types/schema';

function WordDiff({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
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

export function TailorDiffReview({ active, source }: { active: CVProfile; source?: CVProfile }) {
  const updateSummary = useAppStore(s => s.updateSummary);
  const updateExperience = useAppStore(s => s.updateExperience);
  const updateProject = useAppStore(s => s.updateProject);

  const snapshot = active.compositionSnapshot;
  const originMap = snapshot?.bulletOriginMap ?? {};
  const baselineSummary = snapshot ? snapshot.summary : (source?.summary.data ?? '');
  const baselineExperience = snapshot
    ? snapshot.experience
    : (source?.experience.data.map(e => ({
        id: e.id,
        description: e.description ?? '',
        bullets: e.bullets.map(b => ({ id: b.id, text: b.text })),
      })) ?? []);
  const baselineProjects = snapshot
    ? snapshot.projects
    : (source?.projects.data.map(p => ({ id: p.id, bullets: p.bullets.map(b => ({ id: b.id, text: b.text })) })) ?? []);
  const baselineSkills: SkillTag[] = snapshot ? snapshot.skills : (source?.skills.data ?? []);

  if (!snapshot && !source) return null;

  const summaryLocked = active.summary.isLocked;
  const experienceLocked = active.experience.isLocked;
  const projectsLocked = active.projects.isLocked;
  const skillsLocked = active.skills.isLocked;

  const summaryBefore = baselineSummary.trim();
  const summaryAfter = active.summary.data.trim();
  const summaryChanged = summaryBefore !== summaryAfter;

  const resolveOriginIds = (bulletId: string, srcBulletById: Map<string, string>): string[] => {
    const mapped = originMap[bulletId];
    if (mapped?.length) return mapped.filter(id => srcBulletById.has(id));
    return srcBulletById.has(bulletId) ? [bulletId] : [];
  };

  const canonicalBulletKey = (bulletId: string, srcBulletById: Map<string, string>): string => {
    const origins = resolveOriginIds(bulletId, srcBulletById);
    return origins[0] ?? bulletId;
  };

  const computeRestoredOrder = (
    bullets: BulletPoint[],
    originalBullets: { id: string; text: string }[],
  ): BulletPoint[] => {
    const srcBulletById = new Map(originalBullets.map(b => [b.id, b.text]));
    const grouped = new Map<string, BulletPoint[]>();
    for (const b of bullets) {
      const key = canonicalBulletKey(b.id, srcBulletById);
      const list = grouped.get(key) ?? [];
      list.push(b);
      grouped.set(key, list);
    }
    const ordered: BulletPoint[] = [];
    for (const orig of originalBullets) {
      const matches = grouped.get(orig.id);
      if (matches) ordered.push(...matches);
    }
    const orderedSet = new Set(ordered.map(b => b.id));
    const extras = bullets.filter(b => !orderedSet.has(b.id));
    return [...ordered, ...extras];
  };

  const restoreSkill = (skillName: string) => {
    if (skillsLocked) return;
    const matchIndex = baselineSkills.findIndex(
      s => s.name.trim().toLowerCase() === skillName.trim().toLowerCase(),
    );
    if (matchIndex < 0) return;
    const match = baselineSkills[matchIndex];
    useAppStore.setState(state => ({
      profiles: state.profiles.map(p => {
        if (p.profileId !== active.profileId || p.skills.isLocked) return p;
        const alreadyPresent = p.skills.data.some(
          s => s.id === match.id || s.name.trim().toLowerCase() === match.name.trim().toLowerCase(),
        );
        if (alreadyPresent) return p;
        const current = [...p.skills.data];
        let insertAt = current.length;
        for (let k = matchIndex + 1; k < baselineSkills.length; k++) {
          const nextIdx = current.findIndex(s => s.id === baselineSkills[k].id);
          if (nextIdx >= 0) { insertAt = nextIdx; break; }
        }
        current.splice(insertAt, 0, { ...match });
        return { ...p, skills: { ...p.skills, data: current } };
      }),
    }));
  };

  const revertExpBullet = (entryId: string, bulletId: string, originalText: string, originalId?: string) => {
    if (experienceLocked) return;
    const entry = active.experience.data.find(e => e.id === entryId);
    if (!entry) return;
    const canRestoreId = Boolean(
      originalId && !entry.bullets.some(other => other.id === originalId && other.id !== bulletId),
    );
    updateExperience(entryId, {
      bullets: entry.bullets.map(b =>
        b.id === bulletId ? { ...b, id: canRestoreId ? originalId! : b.id, text: originalText, isVerified: true } : b,
      ),
    });
  };

  const revertExpDescription = (entryId: string, originalDesc: string) => {
    if (experienceLocked) return;
    updateExperience(entryId, { description: originalDesc });
  };

  const restoreExpOrder = (entryId: string, originalBullets: { id: string; text: string }[]) => {
    if (experienceLocked) return;
    const entry = active.experience.data.find(e => e.id === entryId);
    if (!entry) return;
    updateExperience(entryId, { bullets: computeRestoredOrder(entry.bullets, originalBullets) });
  };

  const revertProjBullet = (projectId: string, bulletId: string, originalText: string, originalId?: string) => {
    if (projectsLocked) return;
    const proj = active.projects.data.find(p => p.id === projectId);
    if (!proj) return;
    const canRestoreId = Boolean(
      originalId && !proj.bullets.some(other => other.id === originalId && other.id !== bulletId),
    );
    updateProject(projectId, {
      bullets: proj.bullets.map(b =>
        b.id === bulletId ? { ...b, id: canRestoreId ? originalId! : b.id, text: originalText, isVerified: true } : b,
      ),
    });
  };

  const restoreProjOrder = (projectId: string, originalBullets: { id: string; text: string }[]) => {
    if (projectsLocked) return;
    const proj = active.projects.data.find(p => p.id === projectId);
    if (!proj) return;
    updateProject(projectId, { bullets: computeRestoredOrder(proj.bullets, originalBullets) });
  };

  const revertHeadline = () => {
    if (snapshot?.headline === undefined || active.headline.isLocked || active.resumeHeader.isLocked) return;
    useAppStore.setState(state => ({
      profiles: state.profiles.map(p => p.profileId !== active.profileId ? p : {
        ...p,
        headline: { ...p.headline, data: snapshot.headline! },
        resumeHeader: { ...p.resumeHeader, data: { ...p.resumeHeader.data, desiredJobPosition: snapshot.headline! } },
      }),
    }));
  };

  const restoreCertificationOrder = () => {
    if (!snapshot?.certificationOrder?.length || active.certifications.isLocked) return;
    const idx = new Map(snapshot.certificationOrder.map((id, i) => [id, i]));
    useAppStore.setState(state => ({
      profiles: state.profiles.map(p => p.profileId !== active.profileId ? p : {
        ...p,
        certifications: {
          ...p.certifications,
          data: [...p.certifications.data].sort((a, b) => (idx.get(a.id) ?? 9999) - (idx.get(b.id) ?? 9999)),
        },
      }),
    }));
  };

  const restoreProjectListOrder = () => {
    if (!snapshot?.projectOrder?.length || projectsLocked) return;
    const idx = new Map(snapshot.projectOrder.map((id, i) => [id, i]));
    useAppStore.setState(state => ({
      profiles: state.profiles.map(p => p.profileId !== active.profileId ? p : {
        ...p,
        projects: {
          ...p.projects,
          data: [...p.projects.data].sort((a, b) => (idx.get(a.id) ?? 9999) - (idx.get(b.id) ?? 9999)),
        },
      }),
    }));
  };

  const revertAll = () => {
    useAppStore.setState(state => ({
      profiles: state.profiles.map(p => {
        if (p.profileId !== active.profileId) return p;
        const baseExpById = new Map(baselineExperience.map(e => [e.id, e]));
        const baseProjById = new Map(baselineProjects.map(pr => [pr.id, pr]));
        const mappedTailoredIds = new Set(Object.keys(originMap));
        const restoreByOrder = <T extends { id: string }>(items: T[], order?: string[]) => {
          if (!order?.length) return items;
          const idx = new Map(order.map((id, i) => [id, i]));
          return [...items].sort((a, b) => (idx.get(a.id) ?? 9999) - (idx.get(b.id) ?? 9999));
        };
        const shouldRestoreHeadline = snapshot?.headline !== undefined && !p.headline.isLocked && !p.resumeHeader.isLocked;
        return {
          ...p,
          headline: shouldRestoreHeadline ? { ...p.headline, data: snapshot.headline! } : p.headline,
          resumeHeader: shouldRestoreHeadline
            ? { ...p.resumeHeader, data: { ...p.resumeHeader.data, desiredJobPosition: snapshot.headline! } }
            : p.resumeHeader,
          certifications: p.certifications.isLocked ? p.certifications : {
            ...p.certifications,
            data: restoreByOrder(p.certifications.data, snapshot?.certificationOrder),
          },
          summary: p.summary.isLocked ? p.summary : { ...p.summary, data: baselineSummary },
          experience: p.experience.isLocked ? p.experience : {
            ...p.experience,
            data: p.experience.data.map(entry => {
              const origEntry = baseExpById.get(entry.id);
              if (!origEntry) return entry;
              const origIds = new Set(origEntry.bullets.map(ob => ob.id));
              const currentById = new Map(entry.bullets.map(b => [b.id, b]));
              const extras = entry.bullets.filter(b => !origIds.has(b.id) && !mappedTailoredIds.has(b.id));
              return {
                ...entry,
                ...(origEntry.description !== undefined ? { description: origEntry.description } : {}),
                bullets: [
                  ...origEntry.bullets.map(ob => ({
                    id: ob.id,
                    text: ob.text,
                    isVerified: currentById.get(ob.id)?.isVerified ?? true,
                  })),
                  ...extras,
                ],
              };
            }),
          },
          projects: p.projects.isLocked ? p.projects : {
            ...p.projects,
            data: restoreByOrder(p.projects.data, snapshot?.projectOrder).map(proj => {
              const origProj = baseProjById.get(proj.id);
              if (!origProj) return proj;
              const origIds = new Set(origProj.bullets.map(ob => ob.id));
              const currentById = new Map(proj.bullets.map(b => [b.id, b]));
              const extras = proj.bullets.filter(b => !origIds.has(b.id) && !mappedTailoredIds.has(b.id));
              return {
                ...proj,
                bullets: [
                  ...origProj.bullets.map(ob => ({
                    id: ob.id,
                    text: ob.text,
                    isVerified: currentById.get(ob.id)?.isVerified ?? true,
                  })),
                  ...extras,
                ],
              };
            }),
          },
          skills: p.skills.isLocked ? p.skills : { ...p.skills, data: baselineSkills.map(s => ({ ...s })) },
        };
      }),
    }));
  };

  const activeSkillNames = new Set(active.skills.data.map(s => s.name.trim().toLowerCase()));
  const restorableExcluded = baselineSkills.filter(
    s => !activeSkillNames.has(s.name.trim().toLowerCase()),
  );

  const entryBulletsHaveDiff = (bullets: BulletPoint[], origBullets: { id: string; text: string }[]): boolean => {
    const srcBulletById = new Map(origBullets.map(b => [b.id, b.text]));
    const restored = computeRestoredOrder(bullets, origBullets);
    if (restored.map(b => b.id).join(',') !== bullets.map(b => b.id).join(',')) return true;
    const presentOrigIds = new Set<string>();
    for (const b of bullets) {
      if (Object.prototype.hasOwnProperty.call(originMap, b.id)) return true;
      const origins = resolveOriginIds(b.id, srcBulletById);
      origins.forEach(id => presentOrigIds.add(id));
      if (origins.length) {
        const origText = origins.map(id => srcBulletById.get(id)!).join(' ');
        if (origText.trim() !== b.text.trim()) return true;
      }
    }
    return origBullets.some(ob => !presentOrigIds.has(ob.id));
  };

  const expHasDiff = !experienceLocked && active.experience.data.some(entry => {
    const srcEntry = baselineExperience.find(e => e.id === entry.id);
    if (!srcEntry) return false;
    if (srcEntry.description !== undefined && (entry.description ?? '').trim() !== srcEntry.description.trim()) return true;
    return entryBulletsHaveDiff(entry.bullets, srcEntry.bullets);
  });

  const projHasDiff = !projectsLocked && active.projects.data.some(proj => {
    const srcProj = baselineProjects.find(pr => pr.id === proj.id);
    if (!srcProj) return false;
    return entryBulletsHaveDiff(proj.bullets, srcProj.bullets);
  });

  const skillsHaveDiff =
    !skillsLocked &&
    JSON.stringify(active.skills.data.map(s => `${s.id}:${s.category}`)) !==
      JSON.stringify(baselineSkills.map(s => `${s.id}:${s.category}`));
  const currentHeadline = (active.resumeHeader.data.desiredJobPosition?.trim() || active.headline.data || '').trim();
  const headlineChanged = snapshot?.headline !== undefined && !active.headline.isLocked && !active.resumeHeader.isLocked && currentHeadline !== snapshot.headline.trim();
  const certOrderChanged = Boolean(
    snapshot?.certificationOrder?.length &&
    !active.certifications.isLocked &&
    active.certifications.data.map(c => c.id).join(',') !==
      snapshot.certificationOrder.filter(id => active.certifications.data.some(c => c.id === id)).join(','),
  );
  const projOrderChanged = Boolean(
    snapshot?.projectOrder?.length &&
    !projectsLocked &&
    active.projects.data.map(pr => pr.id).join(',') !==
      snapshot.projectOrder.filter(id => active.projects.data.some(pr => pr.id === id)).join(','),
  );
  const hasRevertibleChanges = headlineChanged || (!summaryLocked && summaryChanged) || expHasDiff || projHasDiff || projOrderChanged || certOrderChanged || skillsHaveDiff;

  return (
    <div className="tailor-diff-review">
      <div className="diff-toolbar">
        <span className="diff-snapshot-label">
          {snapshot ? 'Comparing against frozen pre-tailor snapshot' : 'Comparing against source resume'}
        </span>
        <button type="button" className="text-button diff-action" disabled={!hasRevertibleChanges} onClick={revertAll}>
          <RotateCcw size={13} /> Revert all
        </button>
      </div>

      {headlineChanged && snapshot?.headline !== undefined && (
        <div className="diff-card">
          <div className="diff-header">
            <strong>Top Headline</strong>
            <button type="button" className="text-button diff-action" onClick={revertHeadline}>
              <RotateCcw size={13} /> Revert headline
            </button>
          </div>
          <p className="diff-body">
            <WordDiff before={snapshot.headline} after={currentHeadline} />
          </p>
        </div>
      )}

      {certOrderChanged && (
        <div className="diff-card">
          <div className="diff-header">
            <strong>Certifications · sorted by job relevance</strong>
            <button type="button" className="text-button diff-action" onClick={restoreCertificationOrder}>
              <RotateCcw size={13} /> Restore order
            </button>
          </div>
        </div>
      )}

      {projOrderChanged && (
        <div className="diff-card">
          <div className="diff-header">
            <strong>Projects · sorted by job relevance</strong>
            <button type="button" className="text-button diff-action" onClick={restoreProjectListOrder}>
              <RotateCcw size={13} /> Restore order
            </button>
          </div>
        </div>
      )}

      <div className="diff-card">
        <div className="diff-header">
          <strong>Summary diff</strong>
          {summaryChanged && (
            <button
              type="button"
              className="text-button diff-action"
              disabled={summaryLocked}
              onClick={() => updateSummary(baselineSummary)}
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
        const srcEntry = baselineExperience.find(e => e.id === entry.id);
        if (!srcEntry) return null;
        const srcBulletById = new Map(srcEntry.bullets.map(b => [b.id, b.text]));
        const descBefore = (srcEntry.description ?? '').trim();
        const descAfter = (entry.description ?? '').trim();
        const descChanged = srcEntry.description !== undefined && descBefore !== descAfter;
        const changedBullets = entry.bullets
          .map(b => {
            const origins = resolveOriginIds(b.id, srcBulletById);
            if (!origins.length) return null;
            const original = origins.map(id => srcBulletById.get(id)!).join(' ');
            const originalId = origins.length === 1 ? origins[0] : undefined;
            return { bullet: b, original, originalId };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item && item.original.trim() !== item.bullet.text.trim()));
        const restoredOrder = computeRestoredOrder(entry.bullets, srcEntry.bullets);
        const reordered = restoredOrder.map(b => b.id).join(',') !== entry.bullets.map(b => b.id).join(',');

        return (
          <div key={entry.id} className="diff-card">
            <div className="diff-header">
              <strong>
                {entry.roleTitle}
                {entry.companyName ? ` · ${entry.companyName}` : ''}
              </strong>
              {reordered && (
                <button
                  type="button"
                  className="text-button diff-action"
                  disabled={experienceLocked}
                  onClick={() => restoreExpOrder(entry.id, srcEntry.bullets)}
                >
                  <ArrowUpDown size={13} /> Restore order
                </button>
              )}
            </div>
            {descChanged && (
              <div className="diff-item">
                <div className="diff-body">
                  <WordDiff before={descBefore} after={descAfter} />
                </div>
                <button
                  type="button"
                  className="text-button diff-action"
                  disabled={experienceLocked}
                  onClick={() => revertExpDescription(entry.id, srcEntry.description ?? '')}
                >
                  <RotateCcw size={12} /> Revert overview
                </button>
              </div>
            )}
            {changedBullets.length > 0 ? (
              <ul className="diff-list">
                {changedBullets.map(({ bullet, original, originalId }) => (
                  <li key={bullet.id} className="diff-item">
                    <div className="diff-body">
                      <WordDiff before={original} after={bullet.text} />
                    </div>
                    <button
                      type="button"
                      className="text-button diff-action"
                      disabled={experienceLocked}
                      onClick={() => revertExpBullet(entry.id, bullet.id, original, originalId)}
                    >
                      <RotateCcw size={12} /> Revert
                    </button>
                  </li>
                ))}
              </ul>
            ) : !descChanged ? (
              <p className="diff-unchanged">
                {reordered ? 'Bullets reordered by relevance; wording matches original.' : 'Matches original bullets.'}
              </p>
            ) : null}
          </div>
        );
      })}

      {active.projects.data.map(proj => {
        const srcProj = baselineProjects.find(pr => pr.id === proj.id);
        if (!srcProj) return null;
        const srcBulletById = new Map(srcProj.bullets.map(b => [b.id, b.text]));
        const changedBullets = proj.bullets
          .map(b => {
            const origins = resolveOriginIds(b.id, srcBulletById);
            if (!origins.length) return null;
            const original = origins.map(id => srcBulletById.get(id)!).join(' ');
            const originalId = origins.length === 1 ? origins[0] : undefined;
            return { bullet: b, original, originalId };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item && item.original.trim() !== item.bullet.text.trim()));
        const restoredOrder = computeRestoredOrder(proj.bullets, srcProj.bullets);
        const reordered = restoredOrder.map(b => b.id).join(',') !== proj.bullets.map(b => b.id).join(',');

        return (
          <div key={proj.id} className="diff-card">
            <div className="diff-header">
              <strong>
                {proj.name}
                {proj.role ? ` · ${proj.role}` : ''}
              </strong>
              {reordered && (
                <button
                  type="button"
                  className="text-button diff-action"
                  disabled={projectsLocked}
                  onClick={() => restoreProjOrder(proj.id, srcProj.bullets)}
                >
                  <ArrowUpDown size={13} /> Restore order
                </button>
              )}
            </div>
            {changedBullets.length > 0 ? (
              <ul className="diff-list">
                {changedBullets.map(({ bullet, original, originalId }) => (
                  <li key={bullet.id} className="diff-item">
                    <div className="diff-body">
                      <WordDiff before={original} after={bullet.text} />
                    </div>
                    <button
                      type="button"
                      className="text-button diff-action"
                      disabled={projectsLocked}
                      onClick={() => revertProjBullet(proj.id, bullet.id, original, originalId)}
                    >
                      <RotateCcw size={12} /> Revert
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="diff-unchanged">
                {reordered ? 'Bullets reordered by relevance; wording matches original.' : 'Matches original bullets.'}
              </p>
            )}
          </div>
        );
      })}

      {restorableExcluded.length > 0 && (
        <div className="diff-card">
          <div className="diff-header">
            <strong>Omitted skills (click to restore)</strong>
          </div>
          <div className="diff-chips">
            {restorableExcluded.map(skill => (
              <button
                key={skill.id}
                type="button"
                className="diff-chip"
                disabled={skillsLocked}
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
