import { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  buttonText: string;
  onAdd: () => void;
  secondaryButtonText?: string;
  onSecondaryAction?: () => void;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  buttonText, 
  onAdd,
  secondaryButtonText,
  onSecondaryAction 
}: EmptyStateProps) {
  return (
    <div className="group flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-surface-container/70 rounded-2xl bg-surface-container-low/40 backdrop-blur-sm transition-all duration-300 hover:border-primary-500/50 hover:bg-surface-container-low/60">
      <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-surface-container/80 mb-4 text-primary-400 transition-all duration-300 group-hover:scale-110 group-hover:text-primary-300 group-hover:bg-primary-500/20 group-hover:shadow-glow">
        <Icon size={26} />
      </div>
      <h3 className="text-base font-semibold text-on-surface mb-1.5">{title}</h3>
      <p className="text-sm text-on-surface-variant mb-6 max-w-sm leading-relaxed">
        {description}
      </p>
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <Button variant="primary" onClick={onAdd} className="shadow-md hover:shadow-glow">
          {buttonText}
        </Button>
        {secondaryButtonText && onSecondaryAction && (
          <Button variant="secondary" onClick={onSecondaryAction}>
            {secondaryButtonText}
          </Button>
        )}
      </div>
    </div>
  );
}
