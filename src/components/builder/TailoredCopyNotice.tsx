import { ArrowLeft, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export function TailoredCopyNotice() {
  const profiles = useAppStore(s => s.profiles);
  const activeId = useAppStore(s => s.activeProfileId);
  const open = useAppStore(s => s.setActiveProfile);
  const profile = profiles.find(p => p.profileId === activeId);
  const isComposerCopy = Boolean(profile?.compositionChanges || (profile?.baseProfileId && profile?.targetJob));
  if (!profile || (!profile.tailoring && !isComposerCopy)) return null;

  const meta = profile.tailoring;
  const sourceId = meta?.sourceProfileId ?? profile.baseProfileId;
  const original = sourceId ? profiles.find(p => p.profileId === sourceId) : undefined;
  const heading = meta
    ? (meta.changes.length ? 'Tailored copy' : 'Reviewed copy')
    : 'Tailored copy';
  const subtitle = meta
    ? `${meta.jobTitle || 'Target role'}${meta.company ? ` · ${meta.company}` : ''}`
    : (profile.targetJob?.split(/\r?\n/)[0]?.trim().slice(0, 72) || 'Target role');

  return <div className="tailored-copy-notice">
    <Sparkles size={16} aria-hidden="true" />
    <div><strong>{heading}</strong><span title={subtitle}>{subtitle}</span></div>
    {original && <button className="text-button" aria-label="Open original resume" onClick={() => open(original.profileId)}><ArrowLeft size={15} />Original</button>}
  </div>;
}
