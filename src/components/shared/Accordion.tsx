import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export function Accordion({ title, defaultOpen = false, children, icon, rightElement }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[oklch(1_0_0/0.06)] bg-[var(--color-surface-850)] last:border-b-0 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--color-surface-800)] transition-colors focus:outline-none"
      >
        <div className="flex items-center gap-3">
          {icon && <span className="text-[var(--color-primary-400)]">{icon}</span>}
          <span className="font-semibold text-sm text-[var(--color-surface-100)]">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {rightElement}
          <ChevronDown
            size={18}
            className={`text-[var(--color-surface-200)] transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Content wrapper with grid transition */}
      <div 
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="p-4 pt-0 border-t border-[oklch(1_0_0/0.03)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
