import { EditorSidebar } from '@/components/sidebar/EditorSidebar';
import { LivePreviewCanvas } from '@/components/canvas/LivePreviewCanvas';
import { AIPanel } from '@/components/sidebar/AIPanel';

export function DashboardView() {
  return (
    <>
      {/* Left Column: Editor */}
      <aside className="w-[360px] glass-panel border-r border-white/5 flex flex-col h-full shrink-0 z-10 relative">
        <EditorSidebar />
      </aside>

      {/* Center Column: Live Preview */}
      <main className="flex-1 bg-surface-lowest relative overflow-hidden flex flex-col">
        {/* Shader Background */}
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div 
            className="bg-cover bg-center w-full h-full" 
            style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBLASstEvyklQ4sWIAlThehMrXjQnRMriaSXbNez_hFik4FzzDzpHgU8bYoZCfYUvPSbfgkXdV9xtkIwCnKpKJwNsou9jMnc5PJjAIFjDIiuCP0gzt9Xgiyn6HWrNFEgo0cGwH-naZDuZuwJWUjpWgulURMHHdn8tLEEzYTB3rWey5G7aA1vWkEEQziy1bMcuVobx_xbPol9QWbIWT3j2FfCWb5B3Ys6olGshHHBEKSVJtNxwKToaLy')" }}
          />
        </div>
        
        <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto z-10">
          <div className="cv-canvas bg-white w-full max-w-[800px] aspect-[1/1.414] rounded-sm text-black relative flex flex-col">
            <LivePreviewCanvas />
          </div>
        </div>
      </main>

      {/* Right Column: AI Panel */}
      <aside className="w-[400px] glass-panel border-l border-white/5 flex flex-col h-full shrink-0 z-10 relative">
        <AIPanel />
      </aside>
    </>
  );
}
