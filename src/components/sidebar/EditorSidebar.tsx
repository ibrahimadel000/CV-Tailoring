import { SummaryEditor } from '../editors/SummaryEditor';
import { ExperienceCardEditor } from '../editors/ExperienceCardEditor';
import { EducationCardEditor } from '../editors/EducationCardEditor';
import { ProjectCardEditor } from '../editors/ProjectCardEditor';
import { SkillTagEditor } from '../editors/SkillTagEditor';

export function EditorSidebar() {
  return (
    <>
      <div className="p-6 border-b border-white/5 bg-surface-container/20 shrink-0">
        <h2 className="font-headline-md text-headline-md text-primary mb-2">The Builder</h2>
        <p className="font-body-md text-body-md text-on-surface-variant opacity-80">Edit your core information</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        <SummaryEditor />
        <ExperienceCardEditor />
        <EducationCardEditor />
        <ProjectCardEditor />
        <SkillTagEditor />
      </div>
    </>
  );
}
