import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
  badgeCount?: number;
}

export function Accordion({ title, defaultOpen = false, children, badgeCount }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-100 bg-white transition-colors">
      {/* ── Section Header Row (Reference Match) ── */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 cursor-pointer select-none hover:bg-gray-50/70 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-[15px] text-[#111827] tracking-tight">
            {title}
          </span>
          {badgeCount !== undefined && badgeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
              {badgeCount}
            </span>
          )}
        </div>

        {/* Right Button: Rounded Square with ChevronDown (open) or Plus (closed) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="w-7 h-7 rounded-md border border-gray-200 hover:border-gray-400 bg-white flex items-center justify-center text-gray-500 hover:text-gray-900 transition-all shadow-2xs"
          aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
        >
          {isOpen ? (
            <ChevronDown size={16} className="stroke-[2.2]" />
          ) : (
            <Plus size={15} className="stroke-[2.2]" />
          )}
        </button>
      </div>

      {/* ── Collapsible Body ── */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="overflow-hidden">
          <div className="px-6 pb-6 pt-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
