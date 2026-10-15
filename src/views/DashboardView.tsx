import { useState } from 'react';
import { EditorSidebar } from '@/components/sidebar/EditorSidebar';
import { LivePreviewCanvas } from '@/components/canvas/LivePreviewCanvas';
import { AIPanel } from '@/components/sidebar/AIPanel';
import { Pencil, Sparkles, X, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

export function DashboardView() {
  const [activeMobileTab, setActiveMobileTab] = useState<'editor' | 'canvas' | 'ai'>('canvas');
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);

  return (
    <div className="flex-1 w-full h-full flex relative overflow-hidden bg-[#f3f4f6]">
      
      {/* ── Left Column: Clean White Editor Panel (Reference Site Style) ── */}
      <aside
        className={`
          bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-hidden transition-all duration-300 ease-in-out z-20 shadow-xs
          ${/* Mobile: Fullscreen modal drawer when editor tab active */ ''}
          ${activeMobileTab === 'editor' ? 'fixed inset-0 z-50 flex lg:relative lg:inset-auto' : 'hidden lg:flex'}
          ${/* Desktop: width based on collapse state */ ''}
          ${isEditorCollapsed ? 'lg:w-14' : 'lg:w-[460px] xl:w-[480px]'}
        `}
      >
        {/* Mobile close button */}
        <div className="lg:hidden absolute top-4 right-4 z-50">
          <button
            type="button"
            onClick={() => setActiveMobileTab('canvas')}
            className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Desktop Collapse / Expand Header */}
        <div className="hidden lg:flex items-center justify-between px-4 py-2.5 border-b border-gray-200 shrink-0 bg-white">
          {!isEditorCollapsed && (
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Profile Editor
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsEditorCollapsed(!isEditorCollapsed)}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ml-auto"
            title={isEditorCollapsed ? 'Expand Editor (480px)' : 'Collapse Editor for Full Canvas'}
          >
            {isEditorCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Editor Content (hidden when collapsed on desktop) */}
        <div className={`flex-1 flex flex-col overflow-hidden ${isEditorCollapsed ? 'hidden' : 'flex'}`}>
          <EditorSidebar />
        </div>

        {/* Collapsed icon bar on desktop */}
        {isEditorCollapsed && (
          <div 
            onClick={() => setIsEditorCollapsed(false)}
            className="hidden lg:flex flex-col items-center py-6 gap-6 cursor-pointer text-gray-400 hover:text-primary-600 transition-colors"
            title="Click to expand editor"
          >
            <Pencil size={18} />
            <span className="[writing-mode:vertical-lr] rotate-180 text-xs font-semibold tracking-wider uppercase">
              Expand Editor
            </span>
          </div>
        )}
      </aside>

      {/* ── Center Column: Canvas Preview Workspace ── */}
      <main className={`flex-1 h-full overflow-hidden relative flex flex-col z-10 ${
        activeMobileTab !== 'canvas' ? 'hidden lg:flex' : 'flex'
      }`}>
        <LivePreviewCanvas />

        {/* Top-Right Floating AI Studio Trigger Button (when panel closed) */}
        {!isAIOpen && (
          <button
            type="button"
            onClick={() => setIsAIOpen(true)}
            className="hidden lg:flex items-center gap-2 absolute top-15 right-6 z-20 px-3.5 py-1.5 rounded-full bg-white text-xs font-semibold text-primary-600 border border-primary-200 shadow-sm hover:border-primary-400 transition-all hover:shadow"
            title="Open AI Tailor Studio"
          >
            <Sparkles size={14} className="text-primary-600" />
            <span>AI Studio</span>
          </button>
        )}
      </main>

      {/* ── Right Column: AI Studio Panel ── */}
      {isAIOpen && (
        <aside
          className={`
            bg-white border-l border-gray-200 flex flex-col shrink-0 overflow-hidden shadow-2xl transition-all duration-300 ease-in-out z-40
            ${/* Mobile */ ''}
            ${activeMobileTab === 'ai' ? 'fixed inset-0 z-50 flex lg:relative lg:inset-auto' : 'hidden lg:flex'}
            ${/* Desktop */ ''}
            lg:w-[380px] xl:w-[420px]
          `}
        >
          {/* Header Close button */}
          <button
            type="button"
            onClick={() => {
              setIsAIOpen(false);
              if (activeMobileTab === 'ai') setActiveMobileTab('canvas');
            }}
            className="absolute top-4 right-4 z-50 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            title="Close AI Studio"
          >
            <X size={18} />
          </button>
          <AIPanel />
        </aside>
      )}

      {/* ── Mobile Floating Bottom Bar (<lg) ── */}
      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex lg:hidden items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-full border border-gray-200 shadow-2xl">
        <button
          type="button"
          onClick={() => setActiveMobileTab('editor')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
            activeMobileTab === 'editor'
              ? 'bg-primary-600 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Pencil size={15} />
          <span>Editor</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMobileTab('canvas')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
            activeMobileTab === 'canvas'
              ? 'bg-primary-600 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Eye size={15} />
          <span>Canvas</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsAIOpen(true);
            setActiveMobileTab('ai');
          }}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
            activeMobileTab === 'ai'
              ? 'bg-primary-600 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Sparkles size={15} />
          <span>AI Studio</span>
        </button>
      </nav>

    </div>
  );
}
