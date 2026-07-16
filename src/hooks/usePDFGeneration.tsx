import { pdf } from '@react-pdf/renderer';
import { ResumePDFTemplate } from '@/components/pdf/ResumePDFTemplate';
import type { CVProfile } from '@/types/schema';

interface GenerateOptions {
  profile: CVProfile;
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
}

export function usePDFGeneration() {
  const generatePDF = async (options: GenerateOptions): Promise<Blob> => {
    const doc = (
      <ResumePDFTemplate
        profile={options.profile}
        name={options.name || 'John Doe'}
        email={options.email || ''}
        phone={options.phone || ''}
        linkedin={options.linkedin || ''}
      />
    );

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
