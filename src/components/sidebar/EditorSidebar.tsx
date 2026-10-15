import { ResumeHeaderEditor } from '../editors/ResumeHeaderEditor';
import { SummaryEditor } from '../editors/SummaryEditor';
import { EducationCardEditor } from '../editors/EducationCardEditor';
import { CertificationCardEditor } from '../editors/CertificationCardEditor';
import { ExperienceCardEditor } from '../editors/ExperienceCardEditor';
import { ProjectCardEditor } from '../editors/ProjectCardEditor';
import { SkillTagEditor } from '../editors/SkillTagEditor';
import { Accordion } from '../shared/Accordion';
import { useAppStore } from '@/store/useAppStore';

export function EditorSidebar() {
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const profiles = useAppStore((s) => s.profiles);
  
  const activeProfile = profiles.find(p => p.profileId === activeProfileId);
  const header = activeProfile?.resumeHeader;
  
  const getHeaderBadgeCount = () => {
    if (!header || header.isLocked) return 0;
    let count = 0;
    if (!header.data.name) count++;
    if (!header.data.email) count++;
    return count;
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-y-auto custom-scrollbar divide-y divide-gray-100 select-text">
      
      {/* 1. Personal details (Matches reference screenshot) */}
      <Accordion title="Personal details" defaultOpen={true} badgeCount={getHeaderBadgeCount()}>
        <ResumeHeaderEditor />
      </Accordion>

      {/* 2. Profile (Matches reference screenshot) */}
      <Accordion title="Profile" defaultOpen={true}>
        <SummaryEditor />
      </Accordion>

      {/* 3. Education (Matches reference screenshot) */}
      <Accordion title="Education">
        <EducationCardEditor />
      </Accordion>

      {/* 4. Employment (Matches reference screenshot) */}
      <Accordion title="Employment">
        <ExperienceCardEditor />
      </Accordion>

      {/* 5. Skills (Matches reference screenshot) */}
      <Accordion title="Skills">
        <SkillTagEditor />
      </Accordion>

      {/* 6. Projects & Outside Experience */}
      <Accordion title="Projects & Experience">
        <ProjectCardEditor />
      </Accordion>

      {/* 7. Certifications */}
      <Accordion title="Certifications">
        <CertificationCardEditor />
      </Accordion>

    </div>
  );
}
