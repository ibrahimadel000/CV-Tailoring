import { useEffect, useState } from 'react';
import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { contacts, fullName, headline, resumeBlocks } from './resumeModel';

// Visible document data and saved layout rules invalidate the PDF; autosave/UI changes do not.
export function resumePDFKey(profile: CVProfile, theme: DocumentTheme) {
  return JSON.stringify([profile.profileId, profile.profileName, fullName(profile), contacts(profile), headline(profile), resumeBlocks(profile), profile.pageLayout, theme]);
}
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<Blob>>();
export function getResumePDF(profile: CVProfile, theme: DocumentTheme): Promise<Blob> {
  const key = resumePDFKey(profile, theme);
  const existing = cache.get(key);
  if (existing) return existing;
  // react-pdf uses a shared renderer. Serialize preview/inspection/export work.
  const job = queue.catch(() => {}).then(async () => {
    const [{ pdf }, { BuilderPDF, measurePDFLayout }] = await Promise.all([import('@react-pdf/renderer'), import('./BuilderPDF')]);
    let measurements: ReturnType<typeof measurePDFLayout> = {};
    await pdf(<BuilderPDF profile={profile} theme={theme} onMeasure={node => { measurements = measurePDFLayout(node); }} />).toBlob();
    return pdf(<BuilderPDF profile={profile} theme={theme} measurements={measurements} />).toBlob();
  });
  queue = job;
  cache.set(key, job);
  while (cache.size > 3) cache.delete(cache.keys().next().value!);
  void job.catch(() => { if (cache.get(key) === job) cache.delete(key); });
  return job;
}
export function useResumePDF(profile: CVProfile, theme: DocumentTheme, enabled = true, delay = 650) {
  const key = resumePDFKey(profile, theme);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ blob: Blob | null; key: string; error: boolean }>({ blob: null, key: '', error: false });
  useEffect(() => {
    let live = true;
    if (!enabled) { setResult({ blob: null, key: '', error: false }); return; }
    setResult(prev => ({ ...prev, error: false }));
    const timer = setTimeout(() => {
      void getResumePDF(profile, theme).then(blob => {
        if (live) setResult({ blob, key, error: false });
      }).catch(() => { if (live) setResult(prev => ({ ...prev, error: true })); });
    }, delay);
    return () => { live = false; clearTimeout(timer); };
  }, [key, enabled, retry, delay]);
  return { ...result, currentKey: key, current: result.key === key && enabled, retry: () => setRetry(x => x + 1) };
}
