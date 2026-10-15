import { useAppStore } from '@/store/useAppStore';
import { RichTextEditor } from './RichTextEditor';

export function SummaryEditor() {
  const summary = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.summary);
  const updateSummary = useAppStore((s) => s.updateSummary);

  if (!summary) return null;

  return (
    <div className={`w-full relative ${summary.isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}>
      <div className="flex justify-end mb-2 absolute -top-10 right-0 z-10">
        {summary.isLocked && (
          <span className="text-xs font-semibold tracking-wide px-3 py-1 rounded-full border border-accent-400/30 bg-accent-400/10 text-accent-400">
            ✓ Verified
          </span>
        )}
      </div>
      <RichTextEditor
        value={summary.data}
        onChange={(val) => updateSummary(val)}
        disabled={summary.isLocked}
        placeholder="Write a professional summary..."
      />
    </div>
  );
}
