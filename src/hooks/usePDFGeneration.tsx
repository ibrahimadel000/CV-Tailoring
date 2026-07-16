import { pdf } from '@react-pdf/renderer';
import { ResumePDFTemplate } from '@/components/pdf/ResumePDFTemplate';
import type { TailoredProfile, MasterProfile } from '@/types/schema';

interface GenerateOptions {
  tailoredProfile: TailoredProfile;
  masterProfile: MasterProfile;
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
}

export function usePDFGeneration() {
  const generatePDF = async (options: GenerateOptions): Promise<Blob> => {
    // We instantiate the PDF component as a document
    const doc = (
      <ResumePDFTemplate
        tailoredProfile={options.tailoredProfile}
        masterProfile={options.masterProfile}
        name={options.name || 'John Doe'}
        email={options.email || ''}
        phone={options.phone || ''}
        linkedin={options.linkedin || ''}
      />
    );

    // Run React-PDF's async generation
    const asPdf = pdf(doc);
    const blob = await asPdf.toBlob();
    return blob;
  };

  const downloadPDF = async (options: GenerateOptions, filename: string = 'resume.pdf') => {
    try {
      const blob = await generatePDF(options);
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
    } catch (err) {
      console.error('Failed to generate and download PDF:', err);
      throw err;
    }
  };

  return { generatePDF, downloadPDF };
}
