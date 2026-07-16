import { PDFViewer } from '@react-pdf/renderer';
import { ResumePDFTemplate } from '@/components/pdf/ResumePDFTemplate';
import { useAppStore } from '@/store/useAppStore';

export function LivePreviewCanvas() {
  const { profiles, activeProfileId } = useAppStore();
  
  const activeProfile = profiles.find(p => p.profileId === activeProfileId);

  if (!activeProfile) return null;

  return (
    <div className="w-full h-full flex flex-col relative bg-[#1c1d21]">
      <div className="absolute top-0 w-full h-10 bg-[var(--color-surface-850)] border-b border-[oklch(1_0_0/0.06)] z-10 flex items-center justify-between px-4 shadow-sm">
        <span className="text-xs font-semibold text-[var(--color-surface-200)] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse"></span>
          Live ATS-Optimized PDF
        </span>
      </div>
      
      <div className="flex-1 pt-10">
        <PDFViewer width="100%" height="100%" className="border-none bg-transparent">
          <ResumePDFTemplate 
            profile={activeProfile}
            name="John Doe"
            email="john@example.com"
            phone="(555) 123-4567"
            linkedin="linkedin.com/in/johndoe"
          />
        </PDFViewer>
      </div>
    </div>
  );
}
