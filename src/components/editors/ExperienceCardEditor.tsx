import { useState } from 'react';
import { Plus, Trash2, Briefcase, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { RichTextEditor } from './RichTextEditor';
import { EmptyState } from '../shared/EmptyState';
import { useAppStore } from '@/store/useAppStore';

export function ExperienceCardEditor() {
  const experience = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.experience);
  const {
    addExperience,
    updateExperience,
    removeExperience,
  } = useAppStore();

  const [expandedId, setExpandedId] = useState<string | null>(
    experience?.data[0]?.id || null
  );

  if (!experience) return null;

  const handleAddRole = () => {
    addExperience();
    // After adding, find new card and expand it
    setTimeout(() => {
      const updated = useAppStore.getState().profiles.find(p => p.profileId === useAppStore.getState().activeProfileId)?.experience;
      if (updated && updated.data.length > 0) {
        setExpandedId(updated.data[updated.data.length - 1].id);
      }
    }, 50);
  };

  return (
    <div>
      {experience.data.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            {experience.data.length} {experience.data.length === 1 ? 'Role' : 'Roles'} Added
          </span>
          {!experience.isLocked && (
            <Button variant="secondary" size="sm" onClick={handleAddRole} className="flex items-center gap-1.5">
              <Plus size={15} /> Add Role
            </Button>
          )}
        </div>
      )}

      {experience.data.length === 0 && !experience.isLocked ? (
        <EmptyState
          icon={Briefcase}
          title="No Experience Added"
          description="Highlight your professional background, past roles, and key achievements."
          buttonText="Add Your First Role"
          onAdd={handleAddRole}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {experience.data.map((exp) => {
            const isExpanded = expandedId === exp.id;
            const title = exp.roleTitle || 'Untitled Position';
            const subtitle = [exp.companyName, exp.city].filter(Boolean).join(', ') || 'Company not specified';
            const dateRange = [exp.startDate, exp.endDate].filter(Boolean).join(' – ') || 'Dates not set';

            return (
              <Card
                key={exp.id}
                locked={experience.isLocked}
                className="p-0 border border-gray-200 bg-white rounded-lg overflow-hidden transition-all duration-200 shadow-2xs"
              >
                {/* Collapsible Header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : exp.id)}
                  className={`flex items-center justify-between p-3.5 cursor-pointer select-none transition-colors ${
                    isExpanded ? 'bg-gray-50/80 border-b border-gray-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                      <Briefcase size={16} />
                    </div>
                    <div className="truncate">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">{title}</h4>
                      <p className="text-xs text-gray-500 truncate">
                        {subtitle} • <span className="font-mono">{dateRange}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                    {!experience.isLocked && (
                      <button
                        type="button"
                        onClick={() => removeExperience(exp.id)}
                        className="p-1.5 text-on-surface-variant/60 hover:text-danger hover:bg-danger/10 rounded-md transition-colors"
                        title="Delete Role"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : exp.id)}
                      className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-md transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Form Content */}
                {isExpanded && (
                  <div className="p-5 flex flex-col gap-4 animate-fade-in">
                    {/* Row 1: Position */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Position / Job Title
                      </label>
                      <input
                        type="text"
                        value={exp.roleTitle || ''}
                        onChange={(e) => updateExperience(exp.id, { roleTitle: e.target.value })}
                        placeholder="e.g. Senior Full Stack Engineer"
                        disabled={experience.isLocked}
                        className="input text-sm"
                      />
                    </div>

                    {/* Row 2: Employer & City */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Employer / Company
                        </label>
                        <input
                          type="text"
                          value={exp.companyName || ''}
                          onChange={(e) => updateExperience(exp.id, { companyName: e.target.value })}
                          placeholder="e.g. Acme Corp"
                          disabled={experience.isLocked}
                          className="input text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          City / Location
                        </label>
                        <input
                          type="text"
                          value={exp.city || ''}
                          onChange={(e) => updateExperience(exp.id, { city: e.target.value })}
                          placeholder="e.g. San Francisco, CA (or Remote)"
                          disabled={experience.isLocked}
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
                          value={exp.startDate || ''}
                          onChange={(e) => updateExperience(exp.id, { startDate: e.target.value })}
                          placeholder="e.g. Mar 2021"
                          disabled={experience.isLocked}
                          className="input text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            End Date
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={exp.endDate?.toLowerCase() === 'present'}
                              onChange={(e) => {
                                if (e.target.checked) updateExperience(exp.id, { endDate: 'Present' });
                                else updateExperience(exp.id, { endDate: '' });
                              }}
                              disabled={experience.isLocked}
                              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            Currently here
                          </label>
                        </div>
                        <input
                          type="text"
                          value={exp.endDate || ''}
                          onChange={(e) => updateExperience(exp.id, { endDate: e.target.value })}
                          placeholder="e.g. Present"
                          disabled={experience.isLocked || exp.endDate?.toLowerCase() === 'present'}
                          className={`input text-sm ${exp.endDate?.toLowerCase() === 'present' ? 'opacity-60 bg-gray-50' : ''}`}
                        />
                      </div>
                    </div>

                    {/* Row 4: Description (Rich Text) */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider flex items-center justify-between">
                        <span>Responsibilities & Achievements</span>
                        <span className="text-[11px] font-normal text-gray-500">Bullet points recommended for ATS</span>
                      </label>
                      <RichTextEditor
                        value={exp.description || ''}
                        onChange={(text) => updateExperience(exp.id, { description: text })}
                        placeholder="• Architected microservices with Node.js and Kubernetes...&#10;• Mentored a team of 6 engineers..."
                        disabled={experience.isLocked}
                      />
                    </div>

                    {/* Bottom Collapse Action */}
                    {!experience.isLocked && (
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
