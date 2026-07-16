import { AlertTriangle, Info } from 'lucide-react';
import type { ValidationFlag } from '@/types/schema';

interface Props {
  flag: ValidationFlag;
  onDismiss: () => void;
}

export function ValidationFlagBadge({ flag, onDismiss }: Props) {
  if (flag.dismissed) return null;

  const isCritical = flag.severity === 'critical';
  
  const getMessage = () => {
    switch (flag.type) {
      case 'fabricated_metric': return `Fabricated Metric: ${flag.value}`;
      case 'unknown_proper_noun': return `Unrecognized Proper Noun: ${flag.value}`;
      case 'unknown_technology': return `Unrecognized Tech: ${flag.value}`;
      case 'substantially_altered': return 'Substantially Altered Meaning';
      default: return flag.value;
    }
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
      isCritical 
        ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/20' 
        : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20'
    }`}>
      {isCritical ? <AlertTriangle size={14} /> : <Info size={14} />}
      <span>{getMessage()}</span>
      <button 
        onClick={onDismiss}
        className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
        title="Dismiss flag"
      >
        ×
      </button>
    </div>
  );
}
