import { useEffect, useRef } from 'react';
import { Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '../shared/Button';
import { cn } from '@/lib/utils';

interface BulletInputProps {
  text: string;
  onChange: (text: string) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  placeholder?: string;
  isLocked?: boolean;
}

export function BulletInput({
  text,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  placeholder = 'Add a bullet point...',
  isLocked = false,
}: BulletInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [text]);

  return (
    <div className="flex gap-2 items-start group">
      <div className="flex flex-col gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={onMoveUp} 
          disabled={!onMoveUp || isLocked} 
          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move up"
        >
          <ChevronUp size={14} />
        </button>
        <button 
          onClick={onMoveDown} 
          disabled={!onMoveDown || isLocked} 
          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move down"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      
      <div className="relative flex-1">
        <div className="absolute top-[10px] left-3 text-gray-400 pointer-events-none">
          <span className="text-lg leading-none">&bull;</span>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          disabled={isLocked}
          placeholder={placeholder}
          className={cn('input input--textarea pl-8 min-h-[44px] overflow-hidden', isLocked && 'opacity-60 cursor-not-allowed')}
          rows={1}
        />
      </div>

      {!isLocked && (
        <Button variant="danger" onClick={onRemove} className="mt-1 p-2" title="Delete bullet">
          <Trash2 size={16} />
        </Button>
      )}
    </div>
  );
}
