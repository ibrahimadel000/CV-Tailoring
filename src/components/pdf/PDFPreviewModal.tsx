import { X } from 'lucide-react';
import { PDFViewer } from '@react-pdf/renderer';
import { ResumePDFTemplate } from './ResumePDFTemplate';
import type { TailoredProfile, MasterProfile } from '@/types/schema';

interface Props {
  tailoredProfile: TailoredProfile;
  masterProfile: MasterProfile;
  name: string;
  email: string;
  phone: string;
  linkedin: string;
  onClose: () => void;
}

export function PDFPreviewModal({ tailoredProfile, masterProfile, name, email, phone, linkedin, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-5xl h-[90vh] bg-[var(--color-surface-900)] rounded-xl border border-[oklch(1_0_0/0.1)] shadow-2xl flex flex-col overflow-hidden animate-[fade-in_0.2s_ease-out]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[oklch(1_0_0/0.1)] bg-[var(--color-surface-850)]">
          <h3 className="text-lg font-bold text-[var(--color-surface-100)]">Live PDF Preview</h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-[var(--color-surface-700)] rounded-md transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 bg-neutral-800">
          <PDFViewer width="100%" height="100%" className="border-none">
            <ResumePDFTemplate 
              tailoredProfile={tailoredProfile}
              masterProfile={masterProfile}
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
