import { User, Briefcase, GraduationCap, FolderDot, Code2 } from 'lucide-react';
import { SummaryEditor } from '../editors/SummaryEditor';
import { ExperienceCardEditor } from '../editors/ExperienceCardEditor';
import { EducationCardEditor } from '../editors/EducationCardEditor';
import { ProjectCardEditor } from '../editors/ProjectCardEditor';
import { SkillTagEditor } from '../editors/SkillTagEditor';
import { Accordion } from '../shared/Accordion';

export function EditorSidebar() {
  return (
    <>
      <div className="p-6 border-b border-surface-container shrink-0 text-center">
        <h2 className="font-headline-md text-headline-md font-bold gradient-text mb-1 tracking-wide">The Builder</h2>
        <p className="font-body-md text-sm text-on-surface-variant">Edit your core information</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-transparent">
        <Accordion title="Professional Summary" icon={<User size={18} />} defaultOpen={true}>
          <SummaryEditor />
        </Accordion>

        <Accordion title="Work Experience" icon={<Briefcase size={18} />}>
          <ExperienceCardEditor />
        </Accordion>

        <Accordion title="Education" icon={<GraduationCap size={18} />}>
          <EducationCardEditor />
        </Accordion>

        <Accordion title="Projects" icon={<FolderDot size={18} />}>
          <ProjectCardEditor />
        </Accordion>

        <Accordion title="Skills" icon={<Code2 size={18} />}>
          <SkillTagEditor />
        </Accordion>
      </div>
    </>
  );
}
