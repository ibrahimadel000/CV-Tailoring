import { useState, useEffect } from 'react';
import { computeWordDiff } from '@/services/diffEngine';
import type { DiffToken } from '@/types/schema';

export function useDebouncedDiff(original: string, modified: string, delay: number = 300) {
  const [diffTokens, setDiffTokens] = useState<DiffToken[]>([]);
  const [isDiffing, setIsDiffing] = useState(false);

  useEffect(() => {
    setIsDiffing(true);
    
    const handler = setTimeout(() => {
      const tokens = computeWordDiff(original, modified);
      setDiffTokens(tokens);
      setIsDiffing(false);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [original, modified, delay]);

  return { diffTokens, isDiffing };
}
