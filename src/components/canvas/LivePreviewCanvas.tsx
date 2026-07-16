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
      
      <div className="flex-1 pt-10 pb-16">
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

      {/* Bottom Action Bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass-panel rounded-full px-4 py-2 flex items-center gap-4 shadow-xl border border-white/10 z-20">
        <div className="flex items-center gap-2 border-r border-white/10 pr-4">
          <button className="p-1 hover:bg-white/10 rounded-md text-on-surface-variant hover:text-on-surface transition-colors" title="Zoom Out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6M7 10h6"/></svg>
          </button>
          <span className="text-sm font-medium text-on-surface w-12 text-center">100%</span>
          <button className="p-1 hover:bg-white/10 rounded-md text-on-surface-variant hover:text-on-surface transition-colors" title="Zoom In">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM8 10h4"/></svg>
          </button>
        </div>
        <button className="flex items-center gap-2 text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          Export
        </button>
      </div>
    </div>
  );
}
