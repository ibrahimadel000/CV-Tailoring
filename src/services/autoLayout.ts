import type { CVProfile, DocumentTheme } from '@/types/schema';
import { headline, resumeBlocks, themeMetrics } from '@/components/builder/resumeModel';

export interface AutoLayoutResult {
  theme: DocumentTheme;
  applied: string[];
  changed: boolean;
  estimatedPagesBefore: number;
  estimatedPagesAfter: number;
}

/**
 * Deterministic A4 page-fill estimator (in fractional pages, e.g. 1.25 = 1 full page + 25% of page 2).
 * Used to detect borderline Page-2 spills without running a full PDF layout pass.
 */
export function estimateResumePages(profile: CVProfile, theme: DocumentTheme): number {
  const m = themeMetrics(theme);
  const bodyWidthPt = m.pageWidthPt - m.margin * 2;
  const bodyHeightPt = m.pageHeightPt - m.margin * 2;
  const lineHeightPt = m.size * m.leading;
  // Average Latin glyph width ~0.51em at body font size.
  const charsPerLine = Math.max(42, Math.floor(bodyWidthPt / (m.size * 0.51)));
  const fit = Boolean(theme.fitOnePage);
  const sectionGapPt = Math.max(fit ? 7 : 10, m.gap - 4);

  let heightPt = 0;
  // Header: name + optional headline + contacts + bottom padding/gap
  heightPt += m.headerNameSize * 1.25;
  if (headline(profile)) heightPt += m.headerHeadlineSize * 1.4 + (fit ? 3 : 5);
  heightPt += m.headerContactSize * 1.45 + (fit ? 5 : 8);
  heightPt += m.headerPadBottom + sectionGapPt;

  const blocks = resumeBlocks(profile);
  for (const block of blocks) {
    // Section title
    heightPt += (fit ? 9 : 10) * 1.3 + (fit ? 4 : 6);

    if (block.id === 'certifications' && theme.compactCertifications) {
      const rows = Math.ceil(block.items.length / 2);
      const rowH = Math.max(8, m.size - 0.5) * 1.3 + Math.max(7.5, m.size - 1.5) * 1.3 + (fit ? 5 : 8);
      heightPt += rows * rowH + sectionGapPt;
      continue;
    }

    if (block.id === 'skills') {
      for (const item of block.items) {
        const combined = `${item.title ? `${item.title}: ` : ''}${item.text || ''}`;
        const lines = Math.max(1, Math.ceil(combined.length / charsPerLine));
        heightPt += lines * lineHeightPt + (fit ? 2.5 : 4);
      }
      heightPt += sectionGapPt;
      continue;
    }

    block.items.forEach((item, idx) => {
      if (item.title || item.date) heightPt += lineHeightPt;
      if (item.subtitle) heightPt += Math.max(8, m.size - 1) * m.leading + 2;
      if (item.text) {
        for (const para of item.text.split(/\n+/)) {
          heightPt += Math.max(1, Math.ceil(para.length / charsPerLine)) * lineHeightPt;
        }
        if (item.title) heightPt += 4;
      }
      if (item.bullets?.length) {
        const bulletChars = Math.max(36, charsPerLine - 4);
        for (const b of item.bullets) {
          heightPt += Math.max(1, Math.ceil(b.length / bulletChars)) * lineHeightPt + m.bulletGap;
        }
      }
      heightPt += idx === block.items.length - 1 ? sectionGapPt : m.itemGap;
    });
  }

  return Number((heightPt / bodyHeightPt).toFixed(2));
}

/**
 * Suggests/applies safe ATS-friendly layout optimizations for borderline 2-page CVs:
 * 1. Enables 2-column compactCertifications when there are >= 4 certifications.
 * 2. Enables fitOnePage when estimated content sits in the borderline Page-2 spill zone (1.01 - 1.48 pages).
 * Never mutates baseTheme or profile.
 */
export function autoOptimizeTheme(
  profile: CVProfile,
  baseTheme: DocumentTheme,
  options: { allowFitOnePage?: boolean } = {},
): AutoLayoutResult {
  const before = estimateResumePages(profile, baseTheme);
  const next: DocumentTheme = { ...baseTheme };
  const applied: string[] = [];

  const certCount = profile.certifications.data.filter(c => c.name.trim()).length;
  if (certCount >= 4 && !next.compactCertifications) {
    next.compactCertifications = true;
    applied.push('compactCertifications');
  }

  const afterCerts = estimateResumePages(profile, next);
  if (options.allowFitOnePage !== false && afterCerts > 1.0 && afterCerts <= 1.48 && !next.fitOnePage) {
    next.fitOnePage = true;
    applied.push('fitOnePage');
  }

  const after = estimateResumePages(profile, next);
  return {
    theme: next,
    applied,
    changed: applied.length > 0,
    estimatedPagesBefore: before,
    estimatedPagesAfter: after,
  };
}
