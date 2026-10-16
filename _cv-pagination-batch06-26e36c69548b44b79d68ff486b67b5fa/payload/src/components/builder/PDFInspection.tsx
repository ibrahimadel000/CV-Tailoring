import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { useResumePDF } from './pdfPipeline';
export default function PDFInspection({ profile, theme }: { profile: CVProfile; theme: DocumentTheme }) {
  const result = useResumePDF(profile, theme, true, 0);
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!result.blob || !result.current) { setUrl(''); return; }
    const next = URL.createObjectURL(result.blob); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [result.blob, result.current]);
  if (result.error) return <div className="pdf-loading">Could not prepare the PDF.<button className="secondary-button" onClick={result.retry}>Retry</button></div>;
  return url ? <iframe title="Final resume PDF" className="actual-pdf" src={url} /> : <div className="pdf-loading"><Loader2 size={24} className="spin" />Preparing your PDF…</div>;
}
