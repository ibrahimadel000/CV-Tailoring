import { Plus, Trash2 } from 'lucide-react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { BulletInput } from './BulletInput';
import { useAppStore } from '@/store/useAppStore';

export function ProjectCardEditor() {
  const projects = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.projects);
  const {
    addProject,
    updateProject,
    removeProject,
    addBulletToProject,
    updateProjectBullet,
    removeProjectBullet,
  } = useAppStore();

  if (!projects) return null;

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        {!projects.isLocked && (
          <Button variant="secondary" size="sm" onClick={addProject}>
            <Plus size={16} /> Add Project
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {projects.data.map((proj) => (
          <Card key={proj.id} locked={projects.isLocked} className="flex flex-col gap-4">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={proj.name}
                  onChange={(e) => updateProject(proj.id, { name: e.target.value })}
                  placeholder="Project Name"
                  disabled={projects.isLocked}
                  className={`input font-semibold ${projects.isLocked ? 'bg-transparent border-transparent px-0' : ''}`}
                />
                <input
                  type="text"
                  value={proj.role || ''}
                  onChange={(e) => updateProject(proj.id, { role: e.target.value })}
                  placeholder="Your Role (Optional)"
                  disabled={projects.isLocked}
                  className={`input ${projects.isLocked ? 'bg-transparent border-transparent px-0' : ''}`}
                />
                <div className="md:col-span-2">
                  <input
                    type="url"
                    value={proj.url || ''}
                    onChange={(e) => updateProject(proj.id, { url: e.target.value })}
                    placeholder="Project URL (Optional)"
                    disabled={projects.isLocked}
                    className={`input ${projects.isLocked ? 'bg-transparent border-transparent px-0' : ''}`}
                  />
                </div>
              </div>
              {!projects.isLocked && (
                <Button variant="danger" onClick={() => removeProject(proj.id)} className="p-2">
                  <Trash2 size={18} />
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-3 mt-2">
              {proj.bullets.map((bullet, idx) => (
                <BulletInput
                  key={bullet.id}
                  text={bullet.text}
                  isLocked={projects.isLocked}
                  onChange={(text) => updateProjectBullet(proj.id, bullet.id, text)}
                  onRemove={() => removeProjectBullet(proj.id, bullet.id)}
                  onMoveUp={
                    idx > 0
                      ? () => {
                          const bullets = [...proj.bullets];
                          const temp = bullets[idx - 1];
                          bullets[idx - 1] = bullets[idx];
                          bullets[idx] = temp;
                          updateProject(proj.id, { bullets });
                        }
                      : undefined
                  }
                  onMoveDown={
                    idx < proj.bullets.length - 1
                      ? () => {
                          const bullets = [...proj.bullets];
                          const temp = bullets[idx + 1];
                          bullets[idx + 1] = bullets[idx];
                          bullets[idx] = temp;
                          updateProject(proj.id, { bullets });
                        }
                      : undefined
                  }
                />
              ))}
              {!projects.isLocked && (
                <div className="pl-8 mt-1">
                  <Button variant="ghost" size="sm" onClick={() => addBulletToProject(proj.id)} className="text-[var(--color-primary-300)] hover:text-[var(--color-primary-200)] hover:bg-[var(--color-primary-500)]/10 text-xs">
                    <Plus size={14} /> Add Bullet
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
