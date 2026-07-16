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
    <Card locked={summary.isLocked} className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{summary.title}</h3>
        {summary.isLocked && (
          <span className="text-xs font-medium px-2 py-1 bg-[oklch(0.25_0.06_155)] text-[var(--color-success)] rounded-full border border-[oklch(0.72_0.18_155/0.2)]">
            Verified
          </span>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={summary.data}
        onChange={(e) => updateSummary(e.target.value)}
        disabled={summary.isLocked}
        placeholder="Write a brief professional summary..."
        className={`input input--textarea w-full ${summary.isLocked ? 'opacity-60 cursor-not-allowed bg-transparent border-transparent px-0 resize-none' : ''}`}
        rows={3}
      />
    </Card>
  );
}
