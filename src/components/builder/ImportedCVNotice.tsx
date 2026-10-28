import { FileCheck2 } from 'lucide-react';
import type { ImportMetadata } from '@/types/schema';
export function ImportedCVNotice({ data, onReview }: { data: ImportMetadata; onReview: () => void }) {
  return <div className="imported-cv-notice"><FileCheck2 size={18} aria-hidden="true" /><div><strong title={data.fileName}>Imported resume</strong><span>Check the extracted content before using it.</span></div><button className="text-button" onClick={onReview}>Import details</button></div>;
}
