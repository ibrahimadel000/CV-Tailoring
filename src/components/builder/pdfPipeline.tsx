import { useEffect, useState } from 'react';
import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { visiblePhoto } from './photoModel';
import { contacts, fullName, headline, resumeBlocks, themeMetrics } from './resumeModel';
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
    const [{ pdf }, { BuilderPDF, measurePDFLayout, deriveContinuations, canFlowShortSection }] = await Promise.all([import('@react-pdf/renderer'), import('./BuilderPDF')]);
    // Every pass is measured so later passes can react to real page geometry.
    const render = async (measurements?: PDFMeasurements, continuations?: PDFContinuations | null, flowShortSections = false) => {
      let measured: PDFMeasurements | undefined;
      const blob = await pdf(<BuilderPDF profile={profile} theme={theme} measurements={measurements} continuations={continuations} flowShortSections={flowShortSections} onMeasure={node => { measured = measurePDFLayout(node); }} />).toBlob();
      if (!measured) throw new Error('PDF layout measurement unavailable');
      return { blob, measured };
    };
    const keyOf = (m: PDFMeasurements) => JSON.stringify(deriveContinuations(profile, m));
    const base = await render();
    const heights = base.measured.heights;
    // Keep the existing bounded fixpoint: if continued headings do not stabilize,
    // retain the clean render instead of publishing misleading headings.
    const layout = async (flow: boolean) => {
      const clean = await render({ ...base.measured, heights }, null, flow);
      let points = keyOf(clean.measured);
      if (points === '{}') return { ...clean, stable: true };
      let laid = clean;
      for (let attempt = 0; attempt < 2; attempt++) {
        const candidate = await render({ ...laid.measured, heights }, undefined, flow);
        const next = keyOf(candidate.measured);
        if (next === points) return { ...candidate, stable: true };
        laid = candidate; points = next;
      }
      return { ...clean, stable: false };
    };
    const normal = await layout(false);
    const bodyHeight = 841.89 - themeMetrics(theme).margin * 2;
    const blocks = resumeBlocks(profile);
    // Never second-guess explicit layout choices. Limit the extra PDF renders to
    // documents with 3+ pages and a multi-entry, short, one-page section.
    const manual = Object.values(profile.pageLayout?.sections ?? {}).some(v => v === 'new-page')
      || Object.values(profile.pageLayout?.entries ?? {}).some(v => v !== 'auto');
    const eligible = blocks.filter(block => canFlowShortSection(block, base.measured, bodyHeight)
      && (heights[`measure-block-${block.id}`] ?? Infinity) <= bodyHeight - 2);
    if (normal.measured.pageCount < 3 || manual || !eligible.length) return normal.blob;
    // The alternate is optional: a rendering failure must not prevent export.
    let flowed: Awaited<ReturnType<typeof layout>>;
    try { flowed = await layout(true); } catch { return normal.blob; }
    if (!flowed.stable || flowed.measured.pageCount >= normal.measured.pageCount) return normal.blob;
    // Do not trade an unnecessary page for a lone entry at either end of a
    // previously intact section. Missing measurements are not evidence of safety.
    for (const block of eligible) {
      const pages = (m: PDFMeasurements) => block.items.map((_, i) => m.pages[`measure-entry-${block.id}-${i}-start`]);
      const before = pages(normal.measured), after = pages(flowed.measured);
      if (before.some(p => !p) || after.some(p => !p)) return normal.blob;
      if (new Set(before).size === 1 && new Set(after).size > 1) {
        const counts = new Map<number, number>();
        for (const page of after) counts.set(page, (counts.get(page) ?? 0) + 1);
        if ([...counts.values()].some(count => count < 2)) return normal.blob;
      }
    }
    return flowed.blob;
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
