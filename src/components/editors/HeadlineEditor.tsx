import { useAppStore } from '@/store/useAppStore';
import { RichTextEditor } from './RichTextEditor';

export function HeadlineEditor() {
  const headline = useAppStore((s) => s.profiles.find(p => p.profileId === s.activeProfileId)?.headline);
  const updateHeadline = useAppStore((s) => s.updateHeadline);

  if (!headline) return null;

  return (
    <div className={`w-full relative ${headline.isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}>
      <div className="flex justify-end mb-2 absolute -top-10 right-0 z-10">
        {headline.isLocked && (
          <span className="text-xs font-semibold tracking-wide px-3 py-1 rounded-full border border-accent-400/30 bg-accent-400/10 text-accent-400">
            ✓ Verified
          </span>
        )}
      </div>
      <RichTextEditor
        value={headline.data}
        onChange={(val) => updateHeadline(val)}
        disabled={headline.isLocked}
        placeholder="Write a headline about yourself..."
      />
    </div>
  );
}
