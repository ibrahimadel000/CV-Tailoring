import { useEffect, useState, useRef } from 'react';
import { 
  ArrowLeft, 
  Cloud, 
  Check, 
  Undo2, 
  Redo2, 
  Globe, 
  MoreVertical, 
  Download, 
  Plus, 
  Trash2, 
  Sparkles
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { 
    profiles, 
    activeProfileId, 
    setActiveProfile, 
    createProfile, 
    deleteProfile,
    updateProfileName,
    loadSampleProfile
  } = useAppStore();

  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);
  const [showToast, setShowToast] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const activeProfile = profiles.find(p => p.profileId === activeProfileId);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Show toast on error
  useEffect(() => {
    if (error) {
      setShowToast(true);
      const timer = setTimeout(() => {
        setShowToast(false);
        setTimeout(() => setError(null), 300);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  const handleDownloadClick = () => {
    window.dispatchEvent(new CustomEvent('trigger-pdf-export'));
  };

  const currentTitle = activeProfile?.profileName || 'Resume';

  return (
    <div className="h-screen overflow-hidden flex flex-col font-sans bg-[#f3f4f6]">
      
      {/* ── Top Navigation Bar (Screenshot Style) ── */}
      <nav className="h-14 bg-[#141518] border-b border-[#26282f] flex items-center justify-between px-3 md:px-5 shrink-0 z-50 select-none text-white">
        
        {/* Left: Resumes Back Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1f2025] hover:bg-[#2a2b32] text-zinc-200 border border-[#32343d] text-xs font-medium transition-colors"
            title="Switch or manage resumes"
          >
            <ArrowLeft size={14} />
            <span>Resumes</span>
          </button>
        </div>

        {/* Center: Editable Document Title & Cloud Status */}
        <div className="flex items-center gap-2 text-center max-w-[400px]">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={currentTitle}
              onChange={(e) => {
                if (activeProfileId) {
                  updateProfileName(activeProfileId, e.target.value);
                }
              }}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsEditingTitle(false);
              }}
              className="bg-[#1f2025] border border-[#7c3aed] text-white px-2 py-0.5 rounded text-sm font-medium outline-none text-center"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingTitle(true)}
              className="hover:bg-white/5 px-2 py-1 rounded text-sm font-medium text-zinc-100 flex items-center gap-1.5 transition-colors group truncate"
              title="Click to rename resume"
            >
              <span className="truncate">{currentTitle}</span>
              <span className="text-zinc-400 group-hover:text-zinc-200 text-xs font-normal">✎</span>
            </button>
          )}

          {/* Cloud Sync Status Indicator */}
          <div className="flex items-center text-zinc-400" title="All changes saved in local storage">
            <div className="relative flex items-center justify-center">
              <Cloud size={16} />
              <Check size={9} className="absolute text-emerald-400 stroke-[3]" />
            </div>
          </div>
        </div>

        {/* Right: Actions & Download Button */}
        <div className="flex items-center gap-2">
          {/* Undo / Redo Icons */}
          <div className="hidden sm:flex items-center rounded-md border border-[#32343d] bg-[#1f2025] p-0.5">
            <button
              type="button"
              className="p-1 text-zinc-400 hover:text-white hover:bg-white/5 rounded transition-colors disabled:opacity-40"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={14} />
            </button>
            <div className="w-[1px] h-3 bg-[#32343d]" />
            <button
              type="button"
              className="p-1 text-zinc-400 hover:text-white hover:bg-white/5 rounded transition-colors disabled:opacity-40"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={14} />
            </button>
          </div>

          {/* Language Switcher */}
          <div className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#32343d] bg-[#1f2025] text-xs text-zinc-300">
            <Globe size={13} className="text-zinc-400" />
            <span>EN</span>
          </div>

          {/* More Menu Toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-1.5 rounded-md border border-[#32343d] bg-[#1f2025] hover:bg-[#2a2b32] text-zinc-300 transition-colors"
              title="More options"
            >
              <MoreVertical size={15} />
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#1a1b1f] border border-[#32343d] rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in">
                <div className="p-3 border-b border-[#2e3038]">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Your Resumes</span>
                </div>
                <div className="p-1.5 max-h-56 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                  {profiles.map(p => (
                    <div 
                      key={p.profileId} 
                      className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                        activeProfileId === p.profileId 
                          ? 'bg-[#7c3aed]/20 text-[#a78bfa] font-medium' 
                          : 'text-zinc-200 hover:bg-white/5'
                      }`}
                      onClick={() => {
                        setActiveProfile(p.profileId);
                        setIsMenuOpen(false);
                      }}
                    >
                      <span className="truncate">{p.profileName}</span>
                      {profiles.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteProfile(p.profileId);
                          }}
                          className="text-zinc-500 hover:text-red-400 p-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="p-2 border-t border-[#2e3038] flex flex-col gap-1 bg-[#141518]">
                  <button
                    type="button"
                    onClick={() => {
                      createProfile('New Blank CV');
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-white/5 text-zinc-200 rounded-md text-xs transition-colors"
                  >
                    <Plus size={13} className="text-[#a78bfa]" />
                    <span>Create Blank Resume</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      loadSampleProfile();
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[#7c3aed]/20 text-[#a78bfa] rounded-md text-xs transition-colors font-medium"
                  >
                    <Sparkles size={13} />
                    <span>Load Sample Profile</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Vibrant Purple Download Button (Exact match to reference) */}
          <button
            type="button"
            onClick={handleDownloadClick}
            className="flex items-center gap-1.5 px-3.5 md:px-4 py-1.5 rounded-md bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-xs font-semibold shadow-md transition-all active:scale-95"
            title="Download ATS-Friendly PDF"
          >
            <Download size={14} className="stroke-[2.5]" />
            <span>Download</span>
          </button>
        </div>

      </nav>

      {/* ── Main Content Area ── */}
      <main className="flex-1 flex overflow-hidden bg-[#f3f4f6]">
        {children}
      </main>

      {/* Error Toast */}
      {showToast && error && (
        <div className="toast toast--error" role="alert">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
