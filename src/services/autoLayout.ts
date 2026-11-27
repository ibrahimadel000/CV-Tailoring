import type { CVProfile, DocumentTheme } from '@/types/schema';
import { contactItems, headline, resumeBlocks, themeMetrics } from '@/components/builder/resumeModel';
import { visiblePhoto } from '@/components/builder/photoModel';

export interface AutoLayoutResult {
  theme: DocumentTheme;
  applied: string[];
  changed: boolean;
  rolledBack: boolean;
  mode: 'compact' | 'expand' | 'none';
  targetPages?: number;
  estimatedPagesBefore: number;
  estimatedPagesAfter: number;
}

export interface AutoOptimizeOptions {
  allowFitOnePage?: boolean;
  allowExpand?: boolean;
  targetPages?: number;
  rollbackIfStillOver?: boolean;
  actualPages?: number;
  lastPageFillRatio?: number;
}

/**
 * Deterministic page-fill estimator (in fractional pages, e.g. 1.25 = 1 full page + 25% of page 2).
 * Accounts for margins, font family glyph width, visible photo height, all contact links, and blocks.
 */
export function estimateResumePages(profile: CVProfile, theme: DocumentTheme): number {
  const m = themeMetrics(theme);
  const bodyWidthPt = m.pageWidthPt - m.margin * 2;
  const bodyHeightPt = m.pageHeightPt - m.margin * 2;
  const lineHeightPt = m.size * m.leading;
  const avgGlyphEm = theme.fontFamily === 'mono' ? 0.60 : 0.51;
  const charsPerLine = Math.max(40, Math.floor(bodyWidthPt / (m.size * avgGlyphEm)));
  const fit = Boolean(theme.fitOnePage);
  const sectionGapPt = Math.max(fit ? 7 : 10, m.gap - 4);

  let heightPt = 0;
  // Header: name + optional headline + contacts + optional photo + bottom padding/gap
  const leftHeaderPt = m.headerNameSize * 1.25 + (headline(profile) ? m.headerHeadlineSize * 1.4 + (fit ? 3 : 5) : 0);
  const contactLinePt = m.headerContactSize * 1.45;
  const contacts = contactItems(profile);
  const contactsLen = contacts.map(c => c.label).join('  ·  ').length;
  const hasPhoto = Boolean(visiblePhoto(profile));

  if (m.splitHeader) {
    const contactCharsPerLine = Math.max(18, Math.floor((bodyWidthPt * 0.46) / (m.headerContactSize * (theme.fontFamily === 'mono' ? 0.60 : 0.52))));
    const wrappedContactsPt = contactsLen ? Math.max(1, Math.ceil(contactsLen / contactCharsPerLine)) * contactLinePt : 0;
    const leftWithPhotoPt = hasPhoto ? Math.max(leftHeaderPt, m.photoSize) : leftHeaderPt;
    heightPt += Math.max(leftWithPhotoPt, wrappedContactsPt) + m.headerPadBottom + sectionGapPt;
  } else {
    const fullContactChars = Math.max(36, Math.floor(bodyWidthPt / (m.headerContactSize * (theme.fontFamily === 'mono' ? 0.60 : 0.52))));
    const wrappedContactsPt = contactsLen ? Math.max(1, Math.ceil(contactsLen / fullContactChars)) * contactLinePt : 0;
    const stackedPhotoPt = hasPhoto && m.centeredHeader ? m.photoSize + 16 : 0;
    const contentHeaderPt = leftHeaderPt + wrappedContactsPt + (contactsLen ? (fit ? 5 : 8) : 0);
    const sideBySidePt = hasPhoto && !m.centeredHeader ? Math.max(contentHeaderPt, m.photoSize) : contentHeaderPt;
    heightPt += stackedPhotoPt + sideBySidePt + (m.framedContactBar && contactsLen ? 8 : 0) + (m.framedContactBar && contactsLen ? 4 : m.headerPadBottom) + sectionGapPt;
  }

  const blocks = resumeBlocks(profile);
  for (const block of blocks) {
    // Section title
    heightPt += m.sectionTitleSize * 1.3 + (fit ? 4 : 6);

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
      if ((item.subtitle || item.urlLabel) && !(m.singleLineEntryHeader && item.title)) heightPt += Math.max(8, m.size - 1) * m.leading + 2;
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

const SPACING_STEPS: DocumentTheme['lineSpacing'][] = ['relaxed', 'normal', 'compact'];
const SIZE_STEPS: DocumentTheme['fontSize'][] = ['large', 'medium', 'small'];
const MARGIN_STEPS: NonNullable<DocumentTheme['pageMargins']>[] = ['wide', 'normal', 'narrow'];

/**
 * Bi-directional, readability-preserving layout optimizer (adapted from Reactive Resume's fitToPages, MIT):
 * 1. Compacting spillovers (1.01-1.48 -> 1 page, 2.01-2.38 -> 2 pages, or explicit targetPages):
 *    - Enables 2-column compactCertifications (>= 4 visible certs) when not sparse.
 *    - Steps cleanly through margins / fitOnePage -> lineSpacing -> fontSize (floor: 'small' / 9.5pt),
 *      committing only steps that strictly reduce estimated pages and stopping as soon as <= target.
 *    - Rolls back tightening steps if still over target at the readability floor (default: true).
 * 2. Expanding sparse single-page resumes (< 0.66 pages):
 *    - Gently relaxes fitOnePage -> margins ('wide') -> lineSpacing ('relaxed') -> fontSize ('large'),
 *      stopping around 0.84 fill and never crossing 0.94 onto Page 2.
 * Never mutates baseTheme or profile.
 */
export function autoOptimizeTheme(
  profile: CVProfile,
  baseTheme: DocumentTheme,
  options: AutoOptimizeOptions = {},
): AutoLayoutResult {
  const rollbackIfStillOver = options.rollbackIfStillOver !== false;
  const beforeEst = estimateResumePages(profile, baseTheme);
  const hasRealGeometry =
    typeof options.actualPages === 'number' &&
    Number.isFinite(options.actualPages) &&
    options.actualPages >= 1 &&
    typeof options.lastPageFillRatio === 'number' &&
    Number.isFinite(options.lastPageFillRatio) &&
    options.lastPageFillRatio >= 0;
  const rawRealPages = hasRealGeometry
    ? (options.actualPages! - 1) + Math.min(1, Math.max(0, options.lastPageFillRatio!))
    : beforeEst;
  // A 2+ page PDF with a blank/tiny trailing page still exceeds (actualPages - 1) pages
  const realBefore = hasRealGeometry && options.actualPages! >= 2
    ? Number(Math.max(options.actualPages! - 1 + 0.01, rawRealPages).toFixed(2))
    : Number(rawRealPages.toFixed(2));
  const calibration = hasRealGeometry && beforeEst > 0.1 && realBefore > 0 ? realBefore / beforeEst : 1;
  const measure = (candidate: DocumentTheme) => Number((estimateResumePages(profile, candidate) * calibration).toFixed(2));

  let next: DocumentTheme = { ...baseTheme };
  let applied: string[] = [];
  let rolledBack = false;
  let mode: 'compact' | 'expand' | 'none' = 'none';
  let resolvedTarget: number | undefined = options.targetPages;

  // Capture initial spillover target before compactCertifications mutates page count
  if (resolvedTarget === undefined) {
    if (realBefore > 1.0 && realBefore <= 1.48) {
      resolvedTarget = 1;
    } else if (realBefore > 2.0 && realBefore <= 2.38) {
      resolvedTarget = 2;
    }
  }

  const preCompactTheme: DocumentTheme = { ...next };
  const preCompactApplied: string[] = [];

  const certCount = profile.certifications.hidden
    ? 0
    : profile.certifications.data.filter(c => !c.hidden && c.name.trim()).length;

  // Only auto-compact certifications when the resume is not already sparse
  if (certCount >= 4 && !next.compactCertifications && realBefore >= 0.72) {
    next.compactCertifications = true;
    applied.push('compactCertifications');
  }

  let currentPages = measure(next);

  const canCompact =
    resolvedTarget !== undefined &&
    resolvedTarget >= 1 &&
    currentPages > resolvedTarget &&
    (resolvedTarget !== 1 || options.allowFitOnePage !== false) &&
    (options.targetPages !== undefined || currentPages <= resolvedTarget + (resolvedTarget === 1 ? 0.48 : 0.38));

  if (canCompact && resolvedTarget !== undefined) {
    const preFitTheme: DocumentTheme = { ...preCompactTheme };
    const preFitApplied = [...preCompactApplied];

    const tryCompactStep = (candidate: DocumentTheme, label: string): boolean => {
      const candidatePages = measure(candidate);
      if (candidatePages < currentPages) {
        next = candidate;
        currentPages = candidatePages;
        if (!applied.includes(label)) applied.push(label);
        return true;
      }
      return false;
    };

    if (resolvedTarget === 1) {
      // Step 1: Enable fitOnePage (clamps margins to 32pt cleanly without overwriting pageMargins)
      if (!next.fitOnePage) {
        tryCompactStep({ ...next, fitOnePage: true }, 'fitOnePage');
      }
    } else {
      // Step 1 for 2+ page targets: step margins down cleanly without enabling "Fit to 1 page"
      while (currentPages > resolvedTarget) {
        const curMargin = next.pageMargins ?? 'normal';
        const idx = MARGIN_STEPS.indexOf(curMargin);
        if (idx === -1 || idx >= MARGIN_STEPS.length - 1) break;
        const nextMargin = MARGIN_STEPS[idx + 1];
        if (!tryCompactStep({ ...next, pageMargins: nextMargin }, `pageMargins:${nextMargin}`)) break;
      }
    }

    // Step 2: Tighten line spacing if still over target
    while (currentPages > resolvedTarget) {
      const idx = SPACING_STEPS.indexOf(next.lineSpacing);
      if (idx === -1 || idx >= SPACING_STEPS.length - 1) break;
      const nextSpacing = SPACING_STEPS[idx + 1];
      if (!tryCompactStep({ ...next, lineSpacing: nextSpacing }, `lineSpacing:${nextSpacing}`)) break;
    }

    // Step 3: Step down font size (never below 'small' / 9.5pt floor) if still over target
    while (currentPages > resolvedTarget) {
      const idx = SIZE_STEPS.indexOf(next.fontSize);
      if (idx === -1 || idx >= SIZE_STEPS.length - 1) break;
      const nextSize = SIZE_STEPS[idx + 1];
      if (!tryCompactStep({ ...next, fontSize: nextSize }, `fontSize:${nextSize}`)) break;
    }

    if (rollbackIfStillOver && currentPages > resolvedTarget) {
      next = preFitTheme;
      applied = preFitApplied;
      currentPages = measure(next);
      rolledBack = true;
    } else if (applied.length > preFitApplied.length || applied.length > 0) {
      mode = 'compact';
    }
  } else if (
    options.allowExpand !== false &&
    options.targetPages === undefined &&
    currentPages > 0.08 &&
    currentPages < 0.66
  ) {
    // Gentle sparse-CV expansion: never pad past 0.94 so it stays safely on 1 page
    const tryExpandStep = (candidate: DocumentTheme, label: string): boolean => {
      const candidatePages = measure(candidate);
      if (candidatePages > currentPages && candidatePages <= 0.94) {
        next = candidate;
        currentPages = candidatePages;
        if (!applied.includes(label)) applied.push(label);
        return true;
      }
      return false;
    };

    if (next.fitOnePage && currentPages < 0.84) {
      tryExpandStep({ ...next, fitOnePage: false }, 'fitOnePage:off');
    }
    if (next.compactCertifications && certCount < 6 && currentPages < 0.84) {
      tryExpandStep({ ...next, compactCertifications: false }, 'compactCertifications:off');
    }
    while (currentPages < 0.84) {
      const curMargin = next.pageMargins ?? 'normal';
      const idx = MARGIN_STEPS.indexOf(curMargin);
      if (idx <= 0) break;
      const prevMargin = MARGIN_STEPS[idx - 1];
      if (!tryExpandStep({ ...next, pageMargins: prevMargin }, `pageMargins:${prevMargin}`)) break;
    }
    while (currentPages < 0.84) {
      const idx = SPACING_STEPS.indexOf(next.lineSpacing);
      if (idx <= 0) break;
      const prevSpacing = SPACING_STEPS[idx - 1];
      if (!tryExpandStep({ ...next, lineSpacing: prevSpacing }, `lineSpacing:${prevSpacing}`)) break;
    }
    while (currentPages < 0.84) {
      const idx = SIZE_STEPS.indexOf(next.fontSize);
      if (idx <= 0) break;
      const prevSize = SIZE_STEPS[idx - 1];
      if (!tryExpandStep({ ...next, fontSize: prevSize }, `fontSize:${prevSize}`)) break;
    }

    if (applied.length > 0) {
      mode = 'expand';
    }
  } else if (applied.length > 0) {
    mode = 'compact';
  }

  return {
    theme: next,
    applied,
    changed: applied.length > 0,
    rolledBack,
    mode,
    targetPages: mode === 'compact' ? resolvedTarget : undefined,
    estimatedPagesBefore: realBefore,
    estimatedPagesAfter: currentPages,
  };
}

/**
 * Post-tailor layout balancer: preserves the source resume's natural page count
 * when tailoring adds 2-4 lines, and gently relaxes spacing if tailoring trimmed
 * a resume down to a sparse single page.
 */
export function balanceTailoredTheme(
  sourceProfile: CVProfile,
  tailoredProfile: CVProfile,
  baseTheme: DocumentTheme,
): DocumentTheme {
  const sourcePages = estimateResumePages(sourceProfile, baseTheme);
  const sourcePageCount = Math.max(1, Math.ceil(sourcePages));
  const tailoredPages = estimateResumePages(tailoredProfile, baseTheme);

  // If tailoring pushed a 1-page CV slightly onto page 2, or a 2-page CV slightly onto page 3, tighten cleanly
  if (tailoredPages > sourcePageCount && tailoredPages <= sourcePageCount + 0.38) {
    const opt = autoOptimizeTheme(tailoredProfile, baseTheme, {
      targetPages: sourcePageCount,
      allowFitOnePage: sourcePageCount === 1,
      allowExpand: false,
      rollbackIfStillOver: true,
    });
    if (opt.changed) return opt.theme;
  }

  // Only expand when tailoring actually shortened the CV to a sparse single page and fitOnePage isn't pinned
  if (!baseTheme.fitOnePage && tailoredPages > 0.08 && tailoredPages < 0.62 && tailoredPages < sourcePages - 0.08) {
    const opt = autoOptimizeTheme(tailoredProfile, baseTheme, {
      allowFitOnePage: false,
      allowExpand: true,
    });
    if (opt.changed) return opt.theme;
  }

  return baseTheme;
}
