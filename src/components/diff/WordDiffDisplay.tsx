import type { DiffToken } from '@/types/schema';

interface Props {
  tokens: DiffToken[];
}

export function WordDiffDisplay({ tokens }: Props) {
  return (
    <div className="font-sans text-sm leading-relaxed whitespace-pre-wrap">
      {tokens.map((token, idx) => {
        if (token.type === 'added') {
          return (
            <span key={idx} className="bg-[var(--color-diff-added-bg)] text-[var(--color-diff-added)] font-semibold px-0.5 rounded-sm">
              {token.text}
            </span>
          );
        }
        if (token.type === 'removed') {
          return (
            <span key={idx} className="bg-[var(--color-diff-removed-bg)] text-[var(--color-diff-removed)] line-through opacity-70 px-0.5 mx-0.5 rounded-sm">
              {token.text}
            </span>
          );
        }
        return <span key={idx}>{token.text}</span>;
      })}
    </div>
  );
}
