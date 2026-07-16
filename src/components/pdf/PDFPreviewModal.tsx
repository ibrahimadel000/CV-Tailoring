import { X } from 'lucide-react';
import { PDFViewer } from '@react-pdf/renderer';
import { ResumePDFTemplate } from './ResumePDFTemplate';
import type { CVProfile } from '@/types/schema';

interface Props {
  profile: CVProfile;
  name: string;
  email: string;
  phone: string;
  linkedin: string;
  onClose: () => void;
}

export function PDFPreviewModal({ profile, name, email, phone, linkedin, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-5xl h-[90vh] glass-panel rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ animation: 'var(--animate-fade-in)' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-surface-container/60">
          <h3 className="text-lg font-bold text-on-surface" style={{ fontFamily: 'Outfit, sans-serif' }}>Live PDF Preview</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-on-surface-variant hover:text-on-surface"
          >
            <X size={20} />
          </button>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 bg-neutral-800">
          <PDFViewer width="100%" height="100%" className="border-none">
            <ResumePDFTemplate
              profile={profile}
              name={name}
              email={email}
              phone={phone}
              linkedin={linkedin}
            />
          </PDFViewer>
        </div>
      </div>
    </div>
  );
}
