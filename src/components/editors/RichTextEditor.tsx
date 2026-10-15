import { Bold, Italic, Underline, Link, ListOrdered, List } from 'lucide-react';
import { useRef, useEffect } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function RichTextEditor({ value, onChange, placeholder, disabled }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(100, textareaRef.current.scrollHeight)}px`;
    }
  }, [value]);

  const insertFormatting = (prefix: string, suffix: string) => {
    if (!textareaRef.current || disabled) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = textareaRef.current.value;
    const before = text.substring(0, start);
    const selected = text.substring(start, end);
    const after = text.substring(end);
    
    const newValue = `${before}${prefix}${selected || 'text'}${suffix}${after}`;
    onChange(newValue);
    
    // Restore focus
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + prefix.length, end + prefix.length + (selected ? 0 : 4));
      }
    }, 0);
  };

  return (
    <div className={`w-full rounded-lg bg-white border border-gray-200 overflow-hidden transition-all duration-200 focus-within:border-purple-600 focus-within:ring-2 focus-within:ring-purple-500/10 shadow-2xs ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 bg-gray-50/70">
        <button
          type="button"
          onClick={() => insertFormatting('**', '**')}
          disabled={disabled}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200/60 rounded transition-colors"
          title="Bold"
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          onClick={() => insertFormatting('_', '_')}
          disabled={disabled}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200/60 rounded transition-colors"
          title="Italic"
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          onClick={() => insertFormatting('<u>', '</u>')}
          disabled={disabled}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200/60 rounded transition-colors"
          title="Underline"
        >
          <Underline size={15} />
        </button>
        
        <button
          type="button"
          onClick={() => insertFormatting('[', '](url)')}
          disabled={disabled}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200/60 rounded transition-colors"
          title="Link"
        >
          <Link size={15} />
        </button>

        <div className="w-[1px] h-4 bg-gray-200 mx-1"></div>

        <button
          type="button"
          onClick={() => insertFormatting('\n1. ', '')}
          disabled={disabled}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200/60 rounded transition-colors"
          title="Numbered List"
        >
          <ListOrdered size={15} />
        </button>
        <button
          type="button"
          onClick={() => insertFormatting('\n• ', '')}
          disabled={disabled}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200/60 rounded transition-colors"
          title="Bulleted List"
        >
          <List size={15} />
        </button>
      </div>

      {/* Editor Area */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full bg-white p-3.5 text-sm leading-relaxed text-gray-900 resize-none outline-none min-h-[100px] placeholder:text-gray-400 font-sans transition-colors"
      />
    </div>
  );
}
