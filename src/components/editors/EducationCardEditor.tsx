import { Plus, Trash2 } from 'lucide-react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { useAppStore } from '@/store/useAppStore';

export function EducationCardEditor() {
  const education = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.education);
  const { addEducation, updateEducation, removeEducation } = useAppStore();

  if (!education) return null;

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
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
                <Button variant="danger" onClick={() => removeEducation(edu.id)} className="p-2">
                  <Trash2 size={18} />
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
