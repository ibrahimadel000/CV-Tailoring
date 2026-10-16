import { PDFViewer } from '@react-pdf/renderer';
import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { BuilderPDF } from './BuilderPDF';
export default function PDFInspection({ profile, theme }: { profile: CVProfile; theme: DocumentTheme }) {
  return <PDFViewer className="actual-pdf"><BuilderPDF profile={profile} theme={theme} /></PDFViewer>;
}
