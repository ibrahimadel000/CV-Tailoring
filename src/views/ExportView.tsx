import { useState } from 'react';
import { Download, Eye, ArrowLeft, Send } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { PDFPreviewModal } from '@/components/pdf/PDFPreviewModal';
import { usePDFGeneration } from '@/hooks/usePDFGeneration';
import { useFontLoader } from '@/hooks/useFontLoader';
import { useAppStore } from '@/store/useAppStore';

export function ExportView() {
  const profiles = useAppStore((s) => s.profiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const extensionConnected = useAppStore((s) => s.extensionConnected);

  const { isLoaded: fontsLoaded, error: fontError } = useFontLoader();
  const { downloadPDF, generatePDF } = usePDFGeneration();

  const [showPreview, setShowPreview] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSendingToExtension, setIsSendingToExtension] = useState(false);

  const [name, setName] = useState('Alex Engineer');
  const [email, setEmail] = useState('alex@example.com');
  const [phone, setPhone] = useState('(555) 123-4567');
  const [linkedin, setLinkedin] = useState('linkedin.com/in/alex');

  const activeProfile = profiles.find((p) => p.profileId === activeProfileId);

  const handleDownload = async () => {
    if (!activeProfile) return;
    setIsExporting(true);
    try {
      const safeName = name.replace(/\s+/g, '_');
      const safeCompany = (activeProfile.targetJob || 'Resume').replace(/\s+/g, '_');
      const filename = `${safeName}_${safeCompany}.pdf`;
      await downloadPDF({ profile: activeProfile, name, email, phone, linkedin }, filename);
    } catch (err) {
      console.error(err);
      alert('Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSendToExtension = async () => {
    if (!activeProfile) return;
    setIsSendingToExtension(true);
    try {
      const blob = await generatePDF({ profile: activeProfile, name, email, phone, linkedin });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64data = reader.result as string;
        window.postMessage({
          type: 'PDF_EXPORT_SYNC',
          payload: base64data,
          filename: `${(activeProfile.targetJob || 'Resume').replace(/\s+/g, '_')}.pdf`,
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

  if (!activeProfile) return null;

  return (
    <div className="max-w-2xl mx-auto pb-24" style={{ animation: 'var(--animate-fade-in)' }}>
      {showPreview && (
        <PDFPreviewModal
          profile={activeProfile}
          name={name} email={email} phone={phone} linkedin={linkedin}
          onClose={() => setShowPreview(false)}
        />
      )}
      <div className="mb-10 text-center">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 bg-gradient-to-br from-accent-400 to-primary-400"
          style={{ boxShadow: 'var(--shadow-neon)' }}
        >
          <Download size={32} color="white" />
        </div>
        <h2 className="text-3xl font-bold gradient-text mb-4">Export Your Resume</h2>
        <p className="text-on-surface-variant">
          Your tailored content is ready. Finalize your contact details and export a pixel-perfect, ATS-friendly PDF.
        </p>
      </div>

      {/* Contact Info Card */}
      <div className="glass-card flex flex-col gap-4 p-6 mb-8">
        <h3 className="text-lg font-bold text-on-surface">
          Contact Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface">
            Full Name
            <input className="input" placeholder="e.g. Alex Engineer" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface">
            Email Address
            <input className="input" placeholder="e.g. alex@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface">
            Phone Number
            <input className="input" placeholder="e.g. (555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface">
            LinkedIn / Portfolio
            <input className="input" placeholder="e.g. linkedin.com/in/alex" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
          </label>
        </div>
      </div>

      {fontError && (
        <div className="p-4 rounded-xl glass-card border border-danger/30 text-danger bg-danger/10 text-sm mb-8 font-medium">
          {fontError}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
        <Button variant="secondary" size="lg" className="w-full sm:w-auto">
          <ArrowLeft size={18} />
          Back
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
        <div className="mt-8 p-6 glass-card flex items-center justify-between border-accent-400/30">
          <div>
            <h4 className="font-bold mb-1 text-accent-400">
              Extension Connected
            </h4>
            <p className="text-xs text-on-surface-variant">
              Sync the generated PDF directly back to the extension for auto-uploading to the job board.
            </p>
          </div>
          <Button size="sm" onClick={handleSendToExtension} disabled={!fontsLoaded || isSendingToExtension}>
            <Send size={16} />
            {isSendingToExtension ? 'Syncing...' : 'Sync PDF'}
          </Button>
        </div>
      )}
    </div>
  );
}
