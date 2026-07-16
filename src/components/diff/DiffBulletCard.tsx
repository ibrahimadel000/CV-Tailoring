import { Check, X, Edit2 } from 'lucide-react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { WordDiffDisplay } from './WordDiffDisplay';
import { ValidationFlagBadge } from './ValidationFlagBadge';
import { useDebouncedDiff } from '@/hooks/useDebouncedDiff';
import { useAppStore } from '@/store/useAppStore';
import type { ReviewBulletState } from '@/types/schema';

interface Props {
  expIndex: number;
  bulletIndex: number;
  bullet: ReviewBulletState;
}

export function DiffBulletCard({ expIndex, bulletIndex, bullet }: Props) {
  const { updateReviewBullet, setReviewBulletStatus, dismissValidationFlag } = useAppStore();
  
  // Real-time diff against the original bullet as the user edits the AI output
  const { diffTokens, isDiffing } = useDebouncedDiff(bullet.original, bullet.userEdited);

  const activeFlags = bullet.validationFlags.filter(f => !f.dismissed);

  return (
    <Card className="flex flex-col gap-4 border-[oklch(1_0_0/0.08)]">
      {/* Flags Header */}
      {activeFlags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 pb-4 border-b border-[oklch(1_0_0/0.06)]">
          {activeFlags.map((flag, idx) => (
            <ValidationFlagBadge 
              key={idx} 
              flag={flag} 
              onDismiss={() => dismissValidationFlag(expIndex, bulletIndex, idx)} 
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Original Bullet */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--color-surface-200)] uppercase tracking-wider">
              Original Master Profile
            </span>
          </div>
          <div className="p-3 bg-[var(--color-surface-900)] rounded-md text-sm text-[var(--color-surface-100)] opacity-80 line-clamp-3">
            {bullet.original}
          </div>
        </div>

        {/* Live Diff Editor */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--color-primary-300)] uppercase tracking-wider flex items-center gap-1.5">
              <Edit2 size={12} />
              Tailored & Live Diff
            </span>
            {isDiffing && <span className="text-[10px] text-[var(--color-surface-200)] animate-pulse">Syncing...</span>}
          </div>
          
          <div className="relative group">
            {/* The actual textarea the user types in */}
            <textarea
              value={bullet.userEdited}
              onChange={(e) => updateReviewBullet(expIndex, bulletIndex, e.target.value)}
              className="w-full min-h-[80px] p-3 bg-[var(--color-surface-900)] border border-[oklch(1_0_0/0.1)] rounded-md text-sm text-transparent caret-white resize-y focus:outline-none focus:border-[var(--color-primary-400)] relative z-10 transition-colors"
              spellCheck={false}
              style={{
                // We make text transparent but keep caret visible, so the Diff display underneath shows through
                // This is a common trick for rich text overlay editors
                color: 'transparent',
                background: 'transparent'
              }}
            />
            {/* The rendered diff underneath the transparent textarea */}
            <div className="absolute inset-0 p-3 pointer-events-none z-0 overflow-hidden break-words border border-transparent rounded-md bg-[var(--color-surface-900)]">
              <WordDiffDisplay tokens={diffTokens} />
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex justify-end gap-3 mt-2">
        {bullet.status === 'rejected' ? (
          <span className="text-xs font-medium text-[var(--color-danger)] py-2">Rejected</span>
        ) : (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setReviewBulletStatus(expIndex, bulletIndex, 'rejected')}
            className="text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
          >
            <X size={16} /> Reject Tailoring
          </Button>
        )}

        {bullet.status === 'accepted' ? (
          <Button variant="secondary" size="sm" disabled className="text-[var(--color-success)] border-[var(--color-success)]/30">
            <Check size={16} /> Accepted
          </Button>
        ) : (
          <Button 
            size="sm" 
            onClick={() => setReviewBulletStatus(expIndex, bulletIndex, 'accepted')}
            className={activeFlags.length > 0 ? "bg-[var(--color-warning)] text-black hover:bg-[var(--color-warning)]/90" : ""}
          >
            <Check size={16} /> 
            {activeFlags.length > 0 ? 'Accept with Warnings' : 'Accept Tailoring'}
          </Button>
        )}
      </div>
    </Card>
  );
}
