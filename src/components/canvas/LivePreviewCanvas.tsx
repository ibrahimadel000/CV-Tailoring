import { useState, useEffect, useRef } from 'react';
import { PDFViewer, pdf } from '@react-pdf/renderer';
import { ResumePDFTemplate } from '@/components/pdf/ResumePDFTemplate';
import { ResumeHTMLDocument } from './ResumeHTMLDocument';
import { useAppStore } from '@/store/useAppStore';
import { 
  Download, 
  Copy, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Eye, 
  FileCode, 
  Check, 
  Loader2,
  ChevronDown,
  Palette,
  Type,
  LayoutTemplate,
  MoveVertical,
  Check as CheckIcon
} from 'lucide-react';

const COLOR_PRESETS = [
  { name: 'Dusty Rose', hex: '#b87373' },
  { name: 'Slate Gray', hex: '#334155' },
  { name: 'Classic Navy', hex: '#1e3a8a' },
  { name: 'Forest Emerald', hex: '#047857' },
  { name: 'Royal Violet', hex: '#7c3aed' },
  { name: 'Warm Terracotta', hex: '#c2410c' },
  { name: 'Charcoal Black', hex: '#111827' },
];

export function LivePreviewCanvas() {
  const { profiles, activeProfileId, documentTheme, setDocumentTheme } = useAppStore();
  const activeProfile = profiles.find(p => p.profileId === activeProfileId);

  const [viewMode, setViewMode] = useState<'live' | 'pdf'>('live');
  const [zoom, setZoom] = useState(100);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Floating dock dropdown states
  const [activeDropdown, setActiveDropdown] = useState<'layout' | 'font' | 'spacing' | 'color' | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const header = activeProfile?.resumeHeader.data;
  const fullName = header?.firstName || header?.lastName
    ? `${header?.firstName || ''} ${header?.lastName || ''}`.trim()
    : header?.name || 'Your Full Name';

  // Export PDF Handler
  const handleExportPDF = async () => {
    if (!activeProfile) return;
    setIsExporting(true);
    try {
      const blob = await pdf(
        <ResumePDFTemplate
          profile={activeProfile}
          name={fullName}
          email={header?.email || ''}
          phone={header?.phone || ''}
          linkedin={header?.linkedin || ''}
          location={header?.location || ''}
          github={header?.github || ''}
          accentColor={documentTheme.accentColor}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const cleanFileName = fullName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Resume';
      link.download = `${cleanFileName}_Resume.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('Failed to generate PDF. Please check your browser console.');
    } finally {
      setIsExporting(false);
    }
  };

  // Listen for trigger-pdf-export event from AppShell "Download" button
  useEffect(() => {
    const handleTrigger = () => {
      handleExportPDF();
    };
    window.addEventListener('trigger-pdf-export', handleTrigger);
    return () => window.removeEventListener('trigger-pdf-export', handleTrigger);
  }, [activeProfile, fullName, header, documentTheme.accentColor]);

  // Copy plain text for traditional ATS forms
  const handleCopyPlainText = async () => {
    if (!activeProfile) return;
    try {
      let text = `${fullName.toUpperCase()}\n`;
      if (header?.desiredJobPosition) text += `${header.desiredJobPosition}\n`;
      const contact = [header?.email, header?.phone, header?.location, header?.linkedin, header?.github].filter(Boolean).join(' | ');
      if (contact) text += `${contact}\n\n`;

      if (activeProfile.summary.data) {
        text += `PROFILE\n${activeProfile.summary.data}\n\n`;
      }

      if (activeProfile.education.data.length > 0) {
        text += `EDUCATION\n`;
        activeProfile.education.data.forEach(edu => {
          text += `${edu.degree} - ${edu.institution} (${edu.startDate || ''} - ${edu.endDate || edu.graduationDate || ''})\n`;
          if (edu.description) text += `${edu.description}\n`;
          text += '\n';
        });
      }

      if (activeProfile.experience.data.length > 0) {
        text += `EMPLOYMENT\n`;
        activeProfile.experience.data.forEach(exp => {
          text += `${exp.roleTitle} - ${exp.companyName} (${exp.startDate || ''} - ${exp.endDate || 'Present'})\n`;
          if (exp.description) {
            text += `${exp.description}\n`;
          } else {
            exp.bullets.forEach(b => {
              if (b.text.trim()) text += `• ${b.text}\n`;
            });
          }
          text += '\n';
        });
      }

      if (activeProfile.projects.data.length > 0) {
        text += `PROJECTS\n`;
        activeProfile.projects.data.forEach(p => {
          text += `${p.name} ${p.role ? `(${p.role})` : ''}\n`;
          p.bullets.forEach(b => {
            if (b.text.trim()) text += `• ${b.text}\n`;
          });
          text += '\n';
        });
      }

      const skillsList = activeProfile.skills.data.map(s => s.name).join(', ');
      if (skillsList) {
        text += `SKILLS\n${skillsList}\n`;
      }

      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  if (!activeProfile) return null;

  return (
    <div className="w-full h-full flex flex-col relative bg-[#f3f4f6] select-none">
      
      {/* ── Top Canvas Header Bar ── */}
      <div className="h-12 w-full bg-white border-b border-gray-200 z-20 flex items-center justify-between px-4 shrink-0 shadow-2xs">
        
        {/* Left: View Mode Toggle */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-gray-100 border border-gray-200">
          <button
            type="button"
            onClick={() => setViewMode('live')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === 'live'
                ? 'bg-white text-gray-900 shadow-2xs'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Eye size={13} />
            <span>Document Preview</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('pdf')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === 'pdf'
                ? 'bg-white text-gray-900 shadow-2xs'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <FileCode size={13} />
            <span>PDF Renderer</span>
          </button>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyPlainText}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 bg-white transition-colors"
            title="Copy formatted plain text for ATS application forms"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span className="hidden sm:inline">{copied ? 'Copied ATS Text!' : 'Copy ATS Text'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-xs transition-all disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>{isExporting ? 'Exporting...' : 'Download PDF'}</span>
          </button>
        </div>
      </div>

      {/* ── Canvas Viewport ── */}
      <div className="flex-1 relative overflow-auto p-4 md:p-10 flex justify-center custom-scrollbar">
        {viewMode === 'live' ? (
          <div
            className="transition-transform duration-150 ease-out origin-top shrink-0 pb-28"
            style={{
              transform: `scale(${zoom / 100})`,
              width: '100%',
              maxWidth: '820px',
            }}
          >
            <div className="paper-canvas rounded-lg overflow-hidden border border-gray-200">
              <ResumeHTMLDocument 
                profile={activeProfile} 
                fontFamily={documentTheme.fontFamily} 
              />
            </div>
          </div>
        ) : (
          <div className="w-full h-full max-w-[850px] pb-28">
            <PDFViewer width="100%" height="100%" className="rounded-xl border border-gray-300 shadow-xl bg-gray-100">
              <ResumePDFTemplate 
                profile={activeProfile}
                name={fullName}
                email={header?.email || ''}
                phone={header?.phone || ''}
                linkedin={header?.linkedin || ''}
                location={header?.location || ''}
                github={header?.github || ''}
                accentColor={documentTheme.accentColor}
              />
            </PDFViewer>
          </div>
        )}
      </div>

      {/* ── Signature Floating Bottom Formatting Dock (Matches Reference Screenshot) ── */}
      <div 
        ref={dockRef}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 floating-dock px-3 py-2 flex items-center gap-1.5 z-30 shadow-lg text-xs font-medium text-gray-700"
      >
        {/* Layout Button & Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setActiveDropdown(activeDropdown === 'layout' ? null : 'layout')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors ${
              activeDropdown === 'layout' ? 'bg-gray-100 font-semibold text-gray-900' : ''
            }`}
          >
            <LayoutTemplate size={14} className="text-gray-500" />
            <span className="capitalize">{documentTheme.layoutStyle} Layout</span>
            <ChevronDown size={13} className="text-gray-400" />
          </button>

          {activeDropdown === 'layout' && (
            <div className="absolute bottom-full mb-2 left-0 w-52 bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 animate-fade-in flex flex-col gap-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Layout Template</span>
              {[
                { id: 'modern', label: 'Modern Executive (Top-Rated)' },
                { id: 'split', label: '2-Column Split (Sidebar)' },
                { id: 'minimal', label: 'Minimal Labeled (Reference)' },
                { id: 'classic', label: 'Classic Ivy League' },
              ].map((layout) => (
                <button
                  key={layout.id}
                  type="button"
                  onClick={() => {
                    setDocumentTheme({ layoutStyle: layout.id as any });
                    setActiveDropdown(null);
                  }}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left hover:bg-gray-50 transition-colors ${
                    documentTheme.layoutStyle === layout.id ? 'font-semibold text-primary-600 bg-primary-50' : 'text-gray-700'
                  }`}
                >
                  <span>{layout.label}</span>
                  {documentTheme.layoutStyle === layout.id && <CheckIcon size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200" />

        {/* Font Button & Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setActiveDropdown(activeDropdown === 'font' ? null : 'font')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors ${
              activeDropdown === 'font' ? 'bg-gray-100 font-semibold text-gray-900' : ''
            }`}
          >
            <Type size={14} className="text-gray-500" />
            <span className="capitalize">{documentTheme.fontFamily} • {documentTheme.fontSize || 'medium'}</span>
            <ChevronDown size={13} className="text-gray-400" />
          </button>

          {activeDropdown === 'font' && (
            <div className="absolute bottom-full mb-2 left-0 w-52 bg-white rounded-xl shadow-xl border border-gray-200 p-2 animate-fade-in flex flex-col gap-2">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 block mb-1">Typography</span>
                {[
                  { id: 'sans', label: 'Sans-Serif (Inter)' },
                  { id: 'serif', label: 'Serif (Lora)' },
                  { id: 'mono', label: 'Monospace' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setDocumentTheme({ fontFamily: f.id as any });
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left hover:bg-gray-50 transition-colors ${
                      documentTheme.fontFamily === f.id ? 'font-semibold text-primary-600 bg-primary-50' : 'text-gray-700'
                    }`}
                  >
                    <span>{f.label}</span>
                    {documentTheme.fontFamily === f.id && <CheckIcon size={14} />}
                  </button>
                ))}
              </div>

              <div className="border-t border-gray-100 pt-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 block mb-1">Text Size</span>
                {[
                  { id: 'small', label: 'Small (13.5px)' },
                  { id: 'medium', label: 'Medium (14.5px — Standard)' },
                  { id: 'large', label: 'Large (16px)' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setDocumentTheme({ fontSize: s.id as any });
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left hover:bg-gray-50 transition-colors ${
                      (documentTheme.fontSize || 'medium') === s.id ? 'font-semibold text-primary-600 bg-primary-50' : 'text-gray-700'
                    }`}
                  >
                    <span>{s.label}</span>
                    {(documentTheme.fontSize || 'medium') === s.id && <CheckIcon size={14} />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200" />

        {/* Spacing Button & Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setActiveDropdown(activeDropdown === 'spacing' ? null : 'spacing')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors ${
              activeDropdown === 'spacing' ? 'bg-gray-100 font-semibold text-gray-900' : ''
            }`}
          >
            <MoveVertical size={14} className="text-gray-500" />
            <span className="capitalize">{documentTheme.lineSpacing} Spacing</span>
            <ChevronDown size={13} className="text-gray-400" />
          </button>

          {activeDropdown === 'spacing' && (
            <div className="absolute bottom-full mb-2 left-0 w-52 bg-white rounded-xl shadow-xl border border-gray-200 p-2 animate-fade-in flex flex-col gap-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1">Section & Line Spacing</span>
              {[
                { id: 'compact', label: 'Compact (28px gap)' },
                { id: 'normal', label: 'Normal (40px gap — Recommended)' },
                { id: 'relaxed', label: 'Relaxed (56px gap)' },
              ].map((space) => (
                <button
                  key={space.id}
                  type="button"
                  onClick={() => {
                    setDocumentTheme({ lineSpacing: space.id as any });
                    setActiveDropdown(null);
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left capitalize hover:bg-gray-50 transition-colors ${
                    documentTheme.lineSpacing === space.id ? 'font-semibold text-primary-600 bg-primary-50' : 'text-gray-700'
                  }`}
                >
                  <span>{space.label}</span>
                  {documentTheme.lineSpacing === space.id && <CheckIcon size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200" />

        {/* Accent Color Button & Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setActiveDropdown(activeDropdown === 'color' ? null : 'color')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors ${
              activeDropdown === 'color' ? 'bg-gray-100 font-semibold text-gray-900' : ''
            }`}
          >
            <div 
              className="w-3.5 h-3.5 rounded-full border border-black/20 shrink-0" 
              style={{ backgroundColor: documentTheme.accentColor }} 
            />
            <span>Color</span>
            <ChevronDown size={13} className="text-gray-400" />
          </button>

          {activeDropdown === 'color' && (
            <div className="absolute bottom-full mb-2 -left-12 sm:left-0 w-60 bg-white rounded-xl shadow-xl border border-gray-200 p-3 animate-fade-in flex flex-col gap-2.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Accent Color</span>
              
              {/* Preset Palette Swatches */}
              <div className="grid grid-cols-7 gap-1.5">
                {COLOR_PRESETS.map((preset) => {
                  const isSelected = documentTheme.accentColor.toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => setDocumentTheme({ accentColor: preset.hex })}
                      title={preset.name}
                      style={{ backgroundColor: preset.hex }}
                      className={`w-6 h-6 rounded-full border transition-transform flex items-center justify-center ${
                        isSelected ? 'scale-115 border-gray-900 shadow-xs ring-2 ring-primary-500/30' : 'border-black/10 hover:scale-105'
                      }`}
                    >
                      {isSelected && <CheckIcon size={12} className="text-white drop-shadow" />}
                    </button>
                  );
                })}
              </div>

              {/* Custom Hex Input */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                <Palette size={14} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  value={documentTheme.accentColor}
                  onChange={(e) => setDocumentTheme({ accentColor: e.target.value })}
                  placeholder="#b87373"
                  className="input text-xs py-1 px-2 uppercase font-mono"
                  maxLength={7}
                />
              </div>
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom(z => Math.max(50, z - 10))}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-900 transition-colors"
            title="Zoom Out (-10%)"
          >
            <ZoomOut size={14} />
          </button>

          <button
            type="button"
            onClick={() => setZoom(100)}
            className="text-[11px] font-medium font-mono text-gray-700 hover:text-gray-900 w-9 text-center"
            title="Reset to 100%"
          >
            {zoom}%
          </button>

          <button
            type="button"
            onClick={() => setZoom(z => Math.min(150, z + 10))}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-900 transition-colors"
            title="Zoom In (+10%)"
          >
            <ZoomIn size={14} />
          </button>

          <button
            type="button"
            onClick={() => setZoom(100)}
            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-colors ml-0.5"
            title="Reset Zoom"
          >
            <RotateCcw size={12} />
          </button>
        </div>

      </div>

    </div>
  );
}
