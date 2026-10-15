import { useState } from 'react';
import { Plus, Trash2, GraduationCap, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { EmptyState } from '../shared/EmptyState';
import { RichTextEditor } from './RichTextEditor';
import { useAppStore } from '@/store/useAppStore';

export function EducationCardEditor() {
  const education = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.education);
  const { addEducation, updateEducation, removeEducation } = useAppStore();

  const [expandedId, setExpandedId] = useState<string | null>(
    education?.data[0]?.id || null
  );

  if (!education) return null;

  const handleAddEducation = () => {
    addEducation();
    setTimeout(() => {
      const updated = useAppStore.getState().profiles.find(p => p.profileId === useAppStore.getState().activeProfileId)?.education;
      if (updated && updated.data.length > 0) {
        setExpandedId(updated.data[updated.data.length - 1].id);
      }
    }, 50);
  };

  return (
    <div>
      {education.data.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            {education.data.length} {education.data.length === 1 ? 'Degree' : 'Degrees'} Added
          </span>
          {!education.isLocked && (
            <Button variant="secondary" size="sm" onClick={handleAddEducation} className="flex items-center gap-1.5">
              <Plus size={15} /> Add Degree
            </Button>
          )}
        </div>
      )}

      {education.data.length === 0 && !education.isLocked ? (
        <EmptyState
          icon={GraduationCap}
          title="No Education Added"
          description="Add your educational background, degrees, and academic achievements."
          buttonText="Add Your First Degree"
          onAdd={handleAddEducation}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {education.data.map((edu) => {
            const isExpanded = expandedId === edu.id;
            const degreeTitle = edu.degree || 'Untitled Degree';
            const institutionSubtitle = [edu.institution, edu.city].filter(Boolean).join(', ') || 'Institution not specified';
            const dateDisplay = edu.startDate && edu.endDate 
              ? `${edu.startDate} – ${edu.endDate}` 
              : (edu.graduationDate || 'Dates not set');

            return (
              <Card
                key={edu.id}
                locked={education.isLocked}
                className="p-0 border border-gray-200 bg-white rounded-lg overflow-hidden transition-all duration-200 shadow-2xs"
              >
                {/* Collapsible Header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : edu.id)}
                  className={`flex items-center justify-between p-3.5 cursor-pointer select-none transition-colors ${
                    isExpanded ? 'bg-gray-50/80 border-b border-gray-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <GraduationCap size={16} />
                    </div>
                    <div className="truncate">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">{degreeTitle}</h4>
                      <p className="text-xs text-gray-500 truncate">
                        {institutionSubtitle} • <span className="font-mono">{dateDisplay}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                    {!education.isLocked && (
                      <button
                        type="button"
                        onClick={() => removeEducation(edu.id)}
                        className="p-1.5 text-on-surface-variant/60 hover:text-danger hover:bg-danger/10 rounded-md transition-colors"
                        title="Delete Degree"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : edu.id)}
                      className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-md transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Form Content */}
                {isExpanded && (
                  <div className="p-5 flex flex-col gap-4 animate-fade-in">
                    {/* Row 1: Degree */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Degree / Major
                      </label>
                      <input
                        type="text"
                        value={edu.degree || ''}
                        onChange={(e) => updateEducation(edu.id, { degree: e.target.value })}
                        placeholder="e.g. B.Sc. in Computer Science"
                        disabled={education.isLocked}
                        className="input text-sm"
                      />
                    </div>

                    {/* Row 2: Institution & City */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Institution / University
                        </label>
                        <input
                          type="text"
                          value={edu.institution || ''}
                          onChange={(e) => updateEducation(edu.id, { institution: e.target.value })}
                          placeholder="e.g. UC Berkeley"
                          disabled={education.isLocked}
                          className="input text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          City / Location
                        </label>
                        <input
                          type="text"
                          value={edu.city || ''}
                          onChange={(e) => updateEducation(edu.id, { city: e.target.value })}
                          placeholder="e.g. Berkeley, CA"
                          disabled={education.isLocked}
                          className="input text-sm"
                        />
                      </div>
                    </div>

                    {/* Row 3: Start Date & End Date */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Start Date
                        </label>
                        <input
                          type="text"
                          value={edu.startDate || ''}
                          onChange={(e) => updateEducation(edu.id, { startDate: e.target.value })}
                          placeholder="e.g. 2018"
                          disabled={education.isLocked}
                          className="input text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            End Date / Graduation
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={edu.endDate?.toLowerCase() === 'present'}
                              onChange={(e) => {
                                if (e.target.checked) updateEducation(edu.id, { endDate: 'Present' });
                                else updateEducation(edu.id, { endDate: '' });
                              }}
                              disabled={education.isLocked}
                              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            Currently enrolled
                          </label>
                        </div>
                        <input
                          type="text"
                          value={edu.endDate || ''}
                          onChange={(e) => updateEducation(edu.id, { endDate: e.target.value })}
                          placeholder="e.g. 2022"
                          disabled={education.isLocked || edu.endDate?.toLowerCase() === 'present'}
                          className={`input text-sm ${edu.endDate?.toLowerCase() === 'present' ? 'opacity-60 bg-gray-50' : ''}`}
                        />
                      </div>
                    </div>

                    {/* Row 4: Description */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Activities, GPA & Honors (Optional)
                      </label>
                      <RichTextEditor
                        value={edu.description || ''}
                        onChange={(val) => updateEducation(edu.id, { description: val })}
                        disabled={education.isLocked}
                        placeholder="• GPA 3.8/4.0, Magna Cum Laude&#10;• President of Computer Science Student Association"
                      />
                    </div>

                    {/* Bottom Collapse Action */}
                    {!education.isLocked && (
                      <div className="flex justify-end pt-2 border-t border-gray-100">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setExpandedId(null)}
                          className="px-4 font-medium text-xs"
                        >
                          Collapse Entry
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
