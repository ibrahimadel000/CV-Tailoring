import { useState } from 'react';
import { Download, Eye, ArrowLeft, Send } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { PDFPreviewModal } from '@/components/pdf/PDFPreviewModal';
import { usePDFGeneration } from '@/hooks/usePDFGeneration';
import { useFontLoader } from '@/hooks/useFontLoader';
import { useAppStore } from '@/store/useAppStore';

export function ExportView() {
  const { masterProfile, tailoredProfile, setStep, extensionConnected } = useAppStore();
  const { isLoaded: fontsLoaded, error: fontError } = useFontLoader();
  const { downloadPDF, generatePDF } = usePDFGeneration();
  
  const [showPreview, setShowPreview] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSendingToExtension, setIsSendingToExtension] = useState(false);

  // Temporary contact info state (In a real app, this goes in the master profile)
  const [name, setName] = useState('Alex Engineer');
  const [email, setEmail] = useState('alex@example.com');
  const [phone, setPhone] = useState('(555) 123-4567');
  const [linkedin, setLinkedin] = useState('linkedin.com/in/alex');

  if (!masterProfile || !tailoredProfile) return null;

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const filename = `${name.replace(/\s+/g, '_')}_${tailoredProfile.company.replace(/\s+/g, '_')}_Resume.pdf`;
      await downloadPDF({
        masterProfile,
        tailoredProfile,
        name, email, phone, linkedin
      }, filename);
    } catch (err) {
      console.error(err);
      alert('Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSendToExtension = async () => {
    setIsSendingToExtension(true);
    try {
      const blob = await generatePDF({
        masterProfile, tailoredProfile, name, email, phone, linkedin
      });
      
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64data = reader.result as string;
        window.postMessage({
          type: 'PDF_EXPORT_SYNC',
          payload: base64data,
          filename: `${tailoredProfile.company}_Resume.pdf`
        }, '*');
        alert('Sent to extension successfully!');
      };
    } catch (err) {
      console.error(err);
      alert('Failed to send PDF to extension.');
    } finally {
      setIsSendingToExtension(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-24" style={{ animation: 'var(--animate-fade-in)' }}>
      {showPreview && (
        <PDFPreviewModal 
          masterProfile={masterProfile}
          tailoredProfile={tailoredProfile}
          name={name} email={email} phone={phone} linkedin={linkedin}
          onClose={() => setShowPreview(false)}
        />
      )}

      <div className="mb-10 text-center">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 bg-gradient-to-br from-[#22d3ee] to-[#a855f7]"
          style={{ boxShadow: 'var(--shadow-glow)' }}
        >
          <Download size={32} color="white" />
        </div>
        <h2 className="text-3xl font-bold gradient-text mb-4">Export Your Resume</h2>
        <p className="text-on-surface-variant">
          Your tailored content is ready. Finalize your contact details and export a pixel-perfect, ATS-friendly PDF.
        </p>
      </div>

      {/* Contact Info Card */}
      <div className="glass-card rounded-xl p-6 mb-8">
        <h3 className="text-lg font-bold mb-4 text-on-surface" style={{ fontFamily: 'Outfit, sans-serif' }}>Contact Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input 
            className="input" 
            placeholder="Full Name" 
            value={name} onChange={e => setName(e.target.value)} 
          />
          <input 
            className="input" 
            placeholder="Email" 
            value={email} onChange={e => setEmail(e.target.value)} 
          />
          <input 
            className="input" 
            placeholder="Phone" 
            value={phone} onChange={e => setPhone(e.target.value)} 
          />
          <input 
            className="input" 
            placeholder="LinkedIn / Portfolio" 
            value={linkedin} onChange={e => setLinkedin(e.target.value)} 
          />
        </div>
      </div>

      {fontError && (
        <div className="p-4 rounded-xl glass-card border border-[rgba(255,180,171,0.25)] text-[#ffb4ab] text-sm mb-8">
          {fontError}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
        <Button 
          variant="secondary" 
          size="lg" 
          className="w-full sm:w-auto"
          onClick={() => setStep('review')}
        >
          <ArrowLeft size={18} />
          Back to Review
        </Button>
        
        <Button 
          variant="secondary" 
          size="lg" 
          className="w-full sm:w-auto"
          onClick={() => setShowPreview(true)}
          disabled={!fontsLoaded}
        >
          <Eye size={18} />
          Preview PDF
        </Button>

        <Button 
          size="lg" 
          className="w-full sm:w-auto"
          onClick={handleDownload}
          disabled={!fontsLoaded || isExporting}
        >
          {isExporting ? <span className="animate-pulse">Exporting...</span> : <Download size={18} />}
          Download PDF
        </Button>
      </div>

      {extensionConnected && (
        <div className="mt-8 p-6 rounded-xl glass-card border flex items-center justify-between"
          style={{ borderColor: 'rgba(34,211,238,0.25)' }}>
          <div>
            <h4 className="font-bold mb-1" style={{ color: '#8aebff', fontFamily: 'Outfit, sans-serif' }}>Extension Connected</h4>
            <p className="text-xs text-on-surface-variant">Sync the generated PDF directly back to the extension for auto-uploading to the job board.</p>
          </div>
          <Button 
            size="sm" 
            onClick={handleSendToExtension}
            disabled={!fontsLoaded || isSendingToExtension}
          >
            <Send size={16} />
            {isSendingToExtension ? 'Syncing...' : 'Sync PDF'}
          </Button>
        </div>
      )}
    </div>
  );
}
