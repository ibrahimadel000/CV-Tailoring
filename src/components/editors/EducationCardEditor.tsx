import { Plus, Trash2 } from 'lucide-react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { useAppStore } from '@/store/useAppStore';

export function EducationCardEditor() {
  const education = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.education);
  const { addEducation, updateEducation, removeEducation } = useAppStore();

  if (!education) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">{education.title}</h3>
        {!education.isLocked && (
          <Button variant="secondary" size="sm" onClick={addEducation}>
            <Plus size={16} /> Add Degree
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {education.data.map((edu) => (
          <Card key={edu.id} locked={education.isLocked} className="flex flex-col gap-4">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={edu.degree}
                  onChange={(e) => updateEducation(edu.id, { degree: e.target.value })}
                  placeholder="Degree (e.g. B.Sc. Computer Science)"
                  disabled={education.isLocked}
                  className={`input font-semibold ${education.isLocked ? 'bg-transparent border-transparent px-0' : ''}`}
                />
                <input
                  type="text"
                  value={edu.institution}
                  onChange={(e) => updateEducation(edu.id, { institution: e.target.value })}
                  placeholder="Institution"
                  disabled={education.isLocked}
                  className={`input ${education.isLocked ? 'bg-transparent border-transparent px-0' : ''}`}
                />
                <input
                  type="text"
                  value={edu.graduationDate}
                  onChange={(e) => updateEducation(edu.id, { graduationDate: e.target.value })}
                  placeholder="Graduation Date (e.g. May 2024)"
                  disabled={education.isLocked}
                  className={`input ${education.isLocked ? 'bg-transparent border-transparent px-0' : ''}`}
                />
                <input
                  type="text"
                  value={edu.gpa || ''}
                  onChange={(e) => updateEducation(edu.id, { gpa: e.target.value })}
                  placeholder="GPA (Optional)"
                  disabled={education.isLocked}
                  className={`input ${education.isLocked ? 'bg-transparent border-transparent px-0' : ''}`}
                />
                <div className="md:col-span-2">
                  <input
                    type="text"
                    value={edu.honors?.join(', ') || ''}
                    onChange={(e) => updateEducation(edu.id, { honors: e.target.value.split(',').map(h => h.trim()).filter(Boolean) })}
                    placeholder="Honors (comma separated, Optional)"
                    disabled={education.isLocked}
                    className={`input ${education.isLocked ? 'bg-transparent border-transparent px-0' : ''}`}
                  />
                </div>
              </div>
              {!education.isLocked && (
                <Button variant="ghost" onClick={() => removeEducation(edu.id)} className="text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 p-2">
                  <Trash2 size={20} />
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
