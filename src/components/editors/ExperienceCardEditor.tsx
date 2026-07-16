import { Plus, Trash2 } from 'lucide-react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { BulletInput } from './BulletInput';
import { useAppStore } from '@/store/useAppStore';

export function ExperienceCardEditor() {
  const experience = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.experience);
  const {
    addExperience,
    updateExperience,
    removeExperience,
    addBulletToExperience,
    updateBullet,
    removeBullet,
  } = useAppStore();

  if (!experience) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">{experience.title}</h3>
        {!experience.isLocked && (
          <Button variant="secondary" size="sm" onClick={addExperience}>
            <Plus size={16} /> Add Role
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {experience.data.map((exp) => (
          <Card key={exp.id} locked={experience.isLocked} className="flex flex-col gap-4">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={exp.roleTitle}
                  onChange={(e) => updateExperience(exp.id, { roleTitle: e.target.value })}
                  placeholder="Role Title (e.g. Senior Developer)"
                  disabled={experience.isLocked}
                  className={`input font-semibold ${experience.isLocked ? 'bg-transparent border-transparent px-0' : ''}`}
                />
                <input
                  type="text"
                  value={exp.companyName}
                  onChange={(e) => updateExperience(exp.id, { companyName: e.target.value })}
                  placeholder="Company Name"
                  disabled={experience.isLocked}
                  className={`input ${experience.isLocked ? 'bg-transparent border-transparent px-0' : ''}`}
                />
                <input
                  type="text"
                  value={exp.startDate}
                  onChange={(e) => updateExperience(exp.id, { startDate: e.target.value })}
                  placeholder="Start Date (e.g. Jan 2020)"
                  disabled={experience.isLocked}
                  className={`input ${experience.isLocked ? 'bg-transparent border-transparent px-0' : ''}`}
                />
                <input
                  type="text"
                  value={exp.endDate}
                  onChange={(e) => updateExperience(exp.id, { endDate: e.target.value })}
                  placeholder="End Date (e.g. Present)"
                  disabled={experience.isLocked}
                  className={`input ${experience.isLocked ? 'bg-transparent border-transparent px-0' : ''}`}
                />
              </div>
              {!experience.isLocked && (
                <Button variant="ghost" onClick={() => removeExperience(exp.id)} className="text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 p-2">
                  <Trash2 size={20} />
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-3 mt-2">
              {exp.bullets.map((bullet, idx) => (
                <BulletInput
                  key={bullet.id}
                  text={bullet.text}
                  isLocked={experience.isLocked}
                  onChange={(text) => updateBullet(exp.id, bullet.id, text)}
                  onRemove={() => removeBullet(exp.id, bullet.id)}
                  onMoveUp={
                    idx > 0
                      ? () => {
                          const bullets = [...exp.bullets];
                          const temp = bullets[idx - 1];
                          bullets[idx - 1] = bullets[idx];
                          bullets[idx] = temp;
                          updateExperience(exp.id, { bullets });
                        }
                      : undefined
                  }
                  onMoveDown={
                    idx < exp.bullets.length - 1
                      ? () => {
                          const bullets = [...exp.bullets];
                          const temp = bullets[idx + 1];
                          bullets[idx + 1] = bullets[idx];
                          bullets[idx] = temp;
                          updateExperience(exp.id, { bullets });
                        }
                      : undefined
                  }
                />
              ))}
              {!experience.isLocked && (
                <div className="pl-8 mt-1">
                  <Button variant="ghost" size="sm" onClick={() => addBulletToExperience(exp.id)} className="text-[var(--color-primary-300)] hover:text-[var(--color-primary-200)] hover:bg-[var(--color-primary-500)]/10 text-xs">
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
