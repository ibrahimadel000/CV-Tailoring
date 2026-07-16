import { useEffect, useRef } from 'react';
import { Card } from '../shared/Card';
import { useAppStore } from '@/store/useAppStore';

export function SummaryEditor() {
  const summary = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.summary);
  const updateSummary = useAppStore((s) => s.updateSummary);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current && summary?.data) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [summary?.data]);

  if (!summary) return null;

  return (
    <div className={`w-full relative ${summary.isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}>
      <div className="flex justify-end mb-2">
        {summary.isLocked && (
          <span className="text-xs font-semibold tracking-wide px-3 py-1 rounded-full"
            style={{ background: 'rgba(34,211,238,0.1)', color: '#8aebff', border: '1px solid rgba(34,211,238,0.25)' }}>
            ✓ Verified
          </span>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={summary.data}
        onChange={(e) => updateSummary(e.target.value)}
        disabled={summary.isLocked}
        placeholder="Write a brief professional summary..."
        className={`w-full bg-[#18181B] border border-black/20 rounded-xl p-4 text-slate-300 font-body-md text-[15px] resize-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all outline-none placeholder:text-slate-500 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] ${summary.isLocked ? 'bg-transparent border-transparent px-0 resize-none' : ''}`}
        rows={3}
      />
    </div>
  );
}
