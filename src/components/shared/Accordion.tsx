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
    <div className="glass-card overflow-hidden shadow-lg transition-shadow">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <div className="flex items-center gap-4">
          {icon && (
            <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-400">
              {icon}
            </div>
          )}
          <span className="font-semibold text-[15px] text-on-surface">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {rightElement}
          <ChevronDown
            size={20}
            className={`text-on-surface-variant transition-transform duration-200 ${
              isOpen ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </div>
      </button>

      {/* Content wrapper with grid transition */}
      <div 
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="overflow-hidden bg-black/20">
          <div className="p-4 border-t border-surface-container">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
