import { useState } from 'react';
import { Plus, Trash2, Rocket, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { BulletInput } from './BulletInput';
import { EmptyState } from '../shared/EmptyState';
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

  const [expandedId, setExpandedId] = useState<string | null>(
    projects?.data[0]?.id || null
  );

  if (!projects) return null;

  const handleAddProject = () => {
    addProject();
    setTimeout(() => {
      const updated = useAppStore.getState().profiles.find(p => p.profileId === useAppStore.getState().activeProfileId)?.projects;
      if (updated && updated.data.length > 0) {
        setExpandedId(updated.data[updated.data.length - 1].id);
      }
    }, 50);
  };

  return (
    <div>
      {projects.data.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {projects.data.length} {projects.data.length === 1 ? 'Project' : 'Projects'} Added
          </span>
          {!projects.isLocked && (
            <Button variant="secondary" size="sm" onClick={handleAddProject} className="flex items-center gap-1.5">
              <Plus size={15} /> Add Project
            </Button>
          )}
        </div>
      )}

      {projects.data.length === 0 && !projects.isLocked ? (
        <EmptyState
          icon={Rocket}
          title="No Projects Added"
          description="Showcase side projects, open-source work, or key initiatives with quantifiable results."
          buttonText="Add Your First Project"
          onAdd={handleAddProject}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {projects.data.map((proj) => {
            const isExpanded = expandedId === proj.id;
            const projectTitle = proj.name || 'Untitled Project';
            const roleSubtitle = proj.role || 'Contributor';

            return (
              <Card
                key={proj.id}
                locked={projects.isLocked}
                className="p-0 border-gray-200 bg-white overflow-hidden transition-all duration-200 shadow-xs"
              >
                {/* Collapsible Header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : proj.id)}
                  className={`flex items-center justify-between p-4 cursor-pointer select-none transition-colors ${
                    isExpanded ? 'bg-gray-50/80 border-b border-gray-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
                      <Rocket size={16} />
                    </div>
                    <div className="truncate">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">{projectTitle}</h4>
                      <p className="text-xs text-gray-500 truncate">
                        {roleSubtitle} {proj.url ? `• ${proj.url.replace(/^https?:\/\//, '')}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                    {!projects.isLocked && (
                      <button
                        type="button"
                        onClick={() => removeProject(proj.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete Project"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : proj.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 rounded-md transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Form Content */}
                {isExpanded && (
                  <div className="p-5 flex flex-col gap-4 animate-fade-in bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Project Name
                        </label>
                        <input
                          type="text"
                          value={proj.name}
                          onChange={(e) => updateProject(proj.id, { name: e.target.value })}
                          placeholder="e.g. OpenMetrics Dashboard"
                          disabled={projects.isLocked}
                          className="input text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Role (Optional)
                        </label>
                        <input
                          type="text"
                          value={proj.role || ''}
                          onChange={(e) => updateProject(proj.id, { role: e.target.value })}
                          placeholder="e.g. Creator & Lead Maintainer"
                          disabled={projects.isLocked}
                          className="input text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                        <ExternalLink size={13} />
                        Project Link or Repository (Optional)
                      </label>
                      <input
                        type="url"
                        value={proj.url || ''}
                        onChange={(e) => updateProject(proj.id, { url: e.target.value })}
                        placeholder="e.g. https://github.com/username/project"
                        disabled={projects.isLocked}
                        className="input text-sm"
                      />
                    </div>

                    {/* Bullet Points */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-gray-200">
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center justify-between">
                        <span>Project Impact & Highlights</span>
                        <span className="text-[11px] font-normal text-gray-500">Quantify results (e.g. 1,200+ stars, 99% accuracy)</span>
                      </label>

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
                        <div className="flex items-center justify-between mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => addBulletToProject(proj.id)}
                            className="text-primary-600 hover:text-primary-700 hover:bg-primary-50 text-xs flex items-center gap-1.5"
                          >
                            <Plus size={14} /> Add Bullet
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setExpandedId(null)}
                            className="px-4 font-medium"
                          >
                            Collapse Entry
                          </Button>
                        </div>
                      )}
                    </div>
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
