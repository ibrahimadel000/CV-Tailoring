import { FileCheck2 } from 'lucide-react';
import type { ImportMetadata } from '@/types/schema';

export function ImportedCVNotice({ data, onReview }: { data: ImportMetadata; onReview: () => void }) {
  const needsCheck = data.warnings.some(w => /floating textboxes|review experience|could not be structured/i.test(w));
  const subtitle = data.method === 'ai'
    ? 'AI-structured import — review dates, wording, and links before exporting.'
    : needsCheck
      ? 'Some sections need a quick review — check Experience & Education placement before tailoring.'
      : 'Check the extracted content before using it.';
  return (
    <div className="imported-cv-notice">
      <FileCheck2 size={18} aria-hidden="true" />
      <div>
        <strong title={data.fileName}>Imported resume</strong>
        <span>{subtitle}</span>
      </div>
      <button className="text-button" onClick={onReview}>Import details</button>
    </div>
  );
}
