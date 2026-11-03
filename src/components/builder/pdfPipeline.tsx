import { useEffect, useState } from 'react';
import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { visiblePhoto } from './photoModel';
import { contacts, fullName, headline, resumeBlocks } from './resumeModel';
import type { PDFContinuations, PDFMeasurements } from './BuilderPDF';

// Visible document data and saved layout rules invalidate the PDF; autosave/UI changes do not.
export function resumePDFKey(profile: CVProfile, theme: DocumentTheme) {
  return JSON.stringify([profile.profileId, profile.profileName, fullName(profile), contacts(profile), headline(profile), resumeBlocks(profile), profile.pageLayout, theme, visiblePhoto(profile)]);
}
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<Blob>>();
export function getResumePDF(profile: CVProfile, theme: DocumentTheme): Promise<Blob> {
  const key = resumePDFKey(profile, theme);
  const existing = cache.get(key);
  if (existing) return existing;
  // react-pdf uses a shared renderer. Serialize preview/inspection/export work.
  const job = queue.catch(() => {}).then(async () => {
    const [{ pdf }, { BuilderPDF, measurePDFLayout, deriveContinuations }] = await Promise.all([import('@react-pdf/renderer'), import('./BuilderPDF')]);
    // Every pass is measured so later passes can react to real page geometry.
    const render = async (measurements?: PDFMeasurements, continuations?: PDFContinuations | null) => {
      let measured: PDFMeasurements | undefined;
      const blob = await pdf(<BuilderPDF profile={profile} theme={theme} measurements={measurements} continuations={continuations} onMeasure={node => { measured = measurePDFLayout(node); }} />).toBlob();
      if (!measured) throw new Error('PDF layout measurement unavailable');
      return { blob, measured };
    };
    const keyOf = (m: PDFMeasurements) => JSON.stringify(deriveContinuations(profile, m));
    // Pass 1: natural wrapping measures true heights. Pass 2 keeps one-page
    // sections together on an accurate page map, without continuation headings.
    const base = await render();
    const heights = base.measured.heights;
    const clean = await render({ heights, pages: base.measured.pages }, null);
    let points = keyOf(clean.measured);
    if (points === '{}') return clean.blob;
    // Inserting "(continued)" headings shifts layout, so accept them only at a
    // stable fixpoint; otherwise fall back to the clean keep-together render.
    let laid = clean;
    for (let attempt = 0; attempt < 2; attempt++) {
      const candidate = await render({ heights, pages: laid.measured.pages }, undefined);
      const next = keyOf(candidate.measured);
      if (next === points) return candidate.blob;
      laid = candidate; points = next;
    }
    return clean.blob;
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
