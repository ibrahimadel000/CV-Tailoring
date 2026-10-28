import { ArrowLeft, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

export function TailoredCopyNotice() {
  const profiles = useAppStore(s => s.profiles);
  const activeId = useAppStore(s => s.activeProfileId);
  const open = useAppStore(s => s.setActiveProfile);
  const profile = profiles.find(p => p.profileId === activeId);
  if (!profile?.tailoring) return null;
  const meta = profile.tailoring;
  const original = profiles.find(p => p.profileId === meta.sourceProfileId);
  return <div className="tailored-copy-notice">
    <Sparkles size={16} aria-hidden="true" />
    <div><strong>{meta.changes.length ? 'Tailored copy' : 'Reviewed copy'}</strong><span title={`${meta.jobTitle}${meta.company ? ` · ${meta.company}` : ''}`}>{meta.jobTitle || 'Target role'}{meta.company ? ` · ${meta.company}` : ''}</span></div>
    {original && <button className="text-button" aria-label="Open original resume" onClick={() => open(original.profileId)}><ArrowLeft size={15} />Original</button>}
  </div>;
}
