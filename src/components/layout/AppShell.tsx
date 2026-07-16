import { useEffect, useState } from 'react';
import { ChevronDown, Plus, Trash2, Bell, Settings } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { profiles, activeProfileId, setActiveProfile, createProfile, deleteProfile } = useAppStore();
  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);
  const [showToast, setShowToast] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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

  return (
    <div className="h-screen overflow-hidden flex flex-col font-body-md text-body-md bg-background">
      {/* TopNavBar */}
      <nav className="glass-panel-dark border-b border-surface-container flex justify-between items-center w-full px-10 h-16 sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-6">
          <span className="font-display-lg text-headline-md font-bold tracking-tight gradient-text">CV Tailor Studio</span>
          <div className="hidden md:flex gap-8 ml-8">
            <a className="text-primary-400 border-b-2 border-primary-500 h-16 flex items-center transition-colors font-medium text-sm tracking-wide" href="#">Dashboard</a>
            <a className="text-on-surface-variant h-16 flex items-center hover:text-on-surface transition-colors font-medium text-sm tracking-wide" href="#">History</a>
            <a className="text-on-surface-variant h-16 flex items-center hover:text-on-surface transition-colors font-medium text-sm tracking-wide" href="#">Templates</a>
          </div>
        </div>

        {/* Document Switcher & Settings */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="glass-card flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 0" }}>description</span>
              <span className="font-medium font-body-md text-body-md text-on-surface">
                {profiles.find(p => p.profileId === activeProfileId)?.profileName || 'Select Profile'}
              </span>
              <ChevronDown size={16} className="text-on-surface-variant" />
            </div>

            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 glass-panel-dark rounded-xl shadow-elevated overflow-hidden z-50">
                <div className="p-2 flex flex-col gap-1 max-h-64 overflow-y-auto custom-scrollbar">
                  {profiles.map(p => (
                    <div key={p.profileId} className="flex items-center justify-between group">
                      <button
                        onClick={() => {
                          setActiveProfile(p.profileId);
                          setIsDropdownOpen(false);
                        }}
                        className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition-colors ${activeProfileId === p.profileId ? 'bg-primary-500/20 text-primary-400 font-medium' : 'hover:bg-surface-container-high text-on-surface'}`}
                      >
                        {p.profileName}
                      </button>
                      <button 
                        onClick={() => deleteProfile(p.profileId)}
                        className="p-2 text-danger opacity-0 group-hover:opacity-100 hover:bg-danger/20 rounded-md transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="p-2 border-t border-surface-container">
                  <button 
                    onClick={() => {
                      createProfile('New CV');
                      setIsDropdownOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 hover:bg-primary-500/20 hover:text-primary-400 rounded-md text-sm transition-colors text-on-surface font-medium"
                  >
                    <Plus size={16} /> New CV
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 border-l border-surface-container pl-4">
            <button className="text-on-surface-variant hover:text-primary-400 transition-colors">
              <Bell size={20} />
            </button>
            <button className="text-on-surface-variant hover:text-primary-400 transition-colors">
              <Settings size={20} />
            </button>
            <div className="w-8 h-8 rounded-full border border-primary-500/30 bg-primary-500/10 flex items-center justify-center overflow-hidden shadow-glow">
              <span className="material-symbols-outlined text-primary-400 text-sm">person</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
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
