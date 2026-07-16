import { useState } from 'react';
import { EditorSidebar } from '@/components/sidebar/EditorSidebar';
import { LivePreviewCanvas } from '@/components/canvas/LivePreviewCanvas';
import { AIPanel } from '@/components/sidebar/AIPanel';
import { Pencil, Sparkles, X } from 'lucide-react';

export function DashboardView() {
  const [activePanel, setActivePanel] = useState<'editor' | 'ai' | null>(null);

  return (
    <div className="flex-1 w-full flex relative overflow-hidden mesh-bg p-4 md:p-6 gap-6">
      
      {/* Mobile Toggle Buttons */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex 2xl:hidden gap-4 glass-card p-2 rounded-full shadow-neon">
        <button 
          onClick={() => setActivePanel(activePanel === 'editor' ? null : 'editor')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-colors ${activePanel === 'editor' ? 'bg-primary-500 text-white shadow-glow' : 'hover:bg-white/10 text-on-surface'}`}
        >
          <Pencil size={18} /> Editor
        </button>
        <button 
          onClick={() => setActivePanel(activePanel === 'ai' ? null : 'ai')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-colors ${activePanel === 'ai' ? 'bg-primary-500 text-white shadow-glow' : 'hover:bg-white/10 text-on-surface'}`}
        >
          <Sparkles size={18} /> AI Studio
        </button>
      </div>

      {/* Left Column: Editor */}
      <aside className={`
        absolute 2xl:relative z-50 2xl:z-10
        top-4 bottom-4 2xl:top-auto 2xl:bottom-auto
        left-4 2xl:left-auto
        w-[380px] max-w-[calc(100vw-32px)]
        glass-panel-dark rounded-3xl flex-col h-auto 2xl:h-full shrink-0 overflow-hidden shadow-neon
        transition-transform duration-300 ease-in-out
        ${activePanel === 'editor' ? 'translate-x-0 flex' : '-translate-x-[120%] 2xl:translate-x-0 2xl:flex hidden'}
      `}>
        {activePanel === 'editor' && (
          <button onClick={() => setActivePanel(null)} className="absolute top-6 right-6 z-50 2xl:hidden p-2 bg-white/10 rounded-full hover:bg-white/20 text-white transition-colors">
            <X size={20} />
          </button>
        )}
        <EditorSidebar />
      </aside>

      {/* Center Column: Live Preview */}
      <main className="flex-1 relative flex flex-col items-center justify-center overflow-y-auto z-10 animate-fade-in pb-20 2xl:pb-0" style={{ animationDelay: '0.1s' }}>
        <div className="cv-canvas bg-white w-full max-w-[800px] aspect-[1/1.414] rounded-sm text-black relative flex flex-col canvas-hover overflow-hidden">
          <LivePreviewCanvas />
        </div>
      </main>

      {/* Right Column: AI Panel */}
      <aside className={`
        absolute 2xl:relative z-50 2xl:z-10
        top-4 bottom-4 2xl:top-auto 2xl:bottom-auto
        right-4 2xl:right-auto
        w-[420px] max-w-[calc(100vw-32px)]
        glass-panel-dark rounded-3xl flex-col h-auto 2xl:h-full shrink-0 overflow-hidden shadow-neon
        transition-transform duration-300 ease-in-out
        ${activePanel === 'ai' ? 'translate-x-0 flex' : 'translate-x-[120%] 2xl:translate-x-0 2xl:flex hidden'}
      `}>
        {activePanel === 'ai' && (
          <button onClick={() => setActivePanel(null)} className="absolute top-6 right-6 z-50 2xl:hidden p-2 bg-white/10 rounded-full hover:bg-white/20 text-white transition-colors">
            <X size={20} />
          </button>
        )}
        <AIPanel />
      </aside>

      {/* Mobile Backdrop Overlay */}
      {activePanel && (
        <div 
          className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40 2xl:hidden animate-fade-in"
          onClick={() => setActivePanel(null)}
        />
      )}
    </div>
  );
}
