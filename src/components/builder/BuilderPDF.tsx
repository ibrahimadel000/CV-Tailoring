import { Fragment } from 'react';
import { Document, Font, Image, Link, Page, Text, View } from '@react-pdf/renderer';

import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { visiblePhoto } from './photoModel';
import { contactItems, fullName, headline, resumeBlocks, splitLongTokenForPDF, themeMetrics } from './resumeModel';

// Prevent awkward mid-word breaks while wrapping long URLs/emails cleanly.
Font.registerHyphenationCallback(splitLongTokenForPDF);

// A first, naturally wrapped render measures the real font/layout heights and the
// page on which every entry and bullet starts. Never disable wrapping on a guessed
// character count: an oversized entry must flow.
export type PDFMeasurements = { heights: Record<string, number>; pages: Record<string, number> };
export interface PDFLayoutNode { type?: string; props?: { id?: string }; box?: { height?: number }; children?: PDFLayoutNode[] }
export function measurePDFLayout(node: PDFLayoutNode): PDFMeasurements {
  const heights: Record<string, number> = {};
  const pages: Record<string, number> = {};
  const visit = (n: PDFLayoutNode, page: number) => {
    const id = n.props?.id; const height = n.box?.height;
    if (id?.startsWith('measure-') && typeof height === 'number' && Number.isFinite(height)) {
      // A wrapped fragment's id repeats on each page it spans: sum the heights,
      // and remember only the page where the fragment starts.
      heights[id] = (heights[id] || 0) + height;
      if (page && pages[id] === undefined) pages[id] = page;
    }
    if (n.type === 'DOCUMENT') {
      let next = 0;
      for (const child of n.children ?? []) visit(child, child.type === 'PAGE' ? ++next : page);
    } else n.children?.forEach(child => visit(child, page));
  };
  visit(node, 0);
  return { heights, pages };
}

// Per section: items (after the first) and individual bullets that start on a
// later page than their predecessor. Those places continue the section without
// its heading, so the document adds a "(continued)" heading there.
export type PDFContinuations = Record<string, { items: number[]; bullets: Record<number, number[]> }>;

/**
 * Derived from the measured page map, so continuation points reflect real font
 * metrics, never estimated HTML heights.
 */
export function deriveContinuations(profile: CVProfile, measurements?: PDFMeasurements): PDFContinuations {
  const result: PDFContinuations = {};
  if (!measurements) return result;
  for (const block of resumeBlocks(profile)) {
    const items: number[] = [];
    const bullets: Record<number, number[]> = {};
    let previous = 0;
    for (let i = 0; i < block.items.length; i++) {
      const key = `measure-entry-${block.id}-${i}`;
      const start = measurements.pages[`${key}-start`] ?? 0;
      if (i > 0 && start && previous && start > previous) items.push(i);
      previous = start || previous;
      for (let j = 0; j < (block.items[i].bullets?.length ?? 0); j++) {
        const page = measurements.pages[`${key}-bullet-${j}`] ?? 0;
        if (page && previous && page > previous) (bullets[i] ??= []).push(j);
        previous = page || previous;
      }
    }
    if (items.length || Object.keys(bullets).length) result[block.id] = { items, bullets };
  }
  return result;
}

export function BuilderPDF({ profile, theme, measurements, continuations, onMeasure }: {
  profile: CVProfile; theme: DocumentTheme;
  measurements?: PDFMeasurements;
  // undefined derives continuation points from measurements; null disables them.
  continuations?: PDFContinuations | null;
  onMeasure?: (node: PDFLayoutNode) => void;
}) {
  const m = themeMetrics(theme);
  const centered = m.centeredHeader;
  const photo = visiblePhoto(profile);
  const headerContacts = contactItems(profile);
  const hasFramedContacts = m.framedContactBar && headerContacts.length > 0;
  const bodyHeight = m.pageHeightPt - m.margin * 2;
  const fits = (key: string, limit = bodyHeight - 2) => Boolean(measurements?.heights[key] && measurements.heights[key] <= limit);
  const measuring = !measurements;
  const continued = continuations === null ? {} : continuations ?? deriveContinuations(profile, measurements);
  const fit = Boolean(theme.fitOnePage);
  const titleStyle = {
    fontFamily: m.bold,
    fontSize: m.sectionTitleSize,
    letterSpacing: 0.7,
    textTransform: 'uppercase' as const,
    color: theme.accentColor,
    marginBottom: fit ? 4 : 6,
    ...(m.sectionBgColor !== 'transparent'
      ? { backgroundColor: m.sectionBgColor, paddingVertical: 2.5, paddingHorizontal: 6, borderRadius: 2 }
      : { borderBottomWidth: 0.75, borderBottomColor: m.sectionRuleColor, paddingBottom: 2 }),
  };
  return <Document title={profile.profileName} author={fullName(profile)} onRender={onMeasure ? result => { const data = (result as unknown as { _INTERNAL__LAYOUT__DATA_?: PDFLayoutNode })._INTERNAL__LAYOUT__DATA_; if (data) onMeasure(data); } : undefined}>
    <Page size={theme.pageSize === 'Letter' ? 'LETTER' : 'A4'} style={{ padding: m.margin, fontFamily: m.font, fontSize: m.size, color: '#243044', lineHeight: m.leading }}>
      <View id="measure-header" style={{ paddingBottom: hasFramedContacts ? 4 : m.headerPadBottom, marginBottom: Math.max(fit ? 7 : 10, m.gap - 4), ...(hasFramedContacts ? {} : { borderBottomWidth: centered ? 1 : m.splitHeader ? 1.5 : 2, borderBottomColor: theme.accentColor }) }}>
        {m.splitHeader ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
            <View style={{ flexDirection: photo ? 'row' : 'column', alignItems: photo ? 'center' : 'flex-start', gap: photo ? 10 : 0, flex: 1 }}>
              {photo && <Image src={photo.source} style={{ width: m.photoSize, height: m.photoSize, borderRadius: photo.shape === 'circle' ? m.photoSize / 2 : 5 }} />}
              <View style={photo ? { flex: 1 } : {}}>
                <Text style={{ fontSize: m.headerNameSize, lineHeight: 1.2, fontFamily: m.bold, color: '#172337', textAlign: 'left' }}>{fullName(profile) || 'Your name'}</Text>
                {Boolean(headline(profile)) && <Text style={{ fontSize: m.headerHeadlineSize, lineHeight: 1.35, color: theme.accentColor, marginTop: 2, textAlign: 'left' }}>{headline(profile)}</Text>}
              </View>
            </View>
            {contactItems(profile).length > 0 && (
              <Text style={{ maxWidth: photo && headerContacts.length >= 4 ? '38%' : '46%', fontSize: m.headerContactSize, lineHeight: 1.45, color: '#526074', textAlign: 'right' }}>
                {contactItems(profile).map((c, idx) => <Text key={idx}>{idx > 0 ? '  ·  ' : ''}{c.url ? <Link src={c.url} style={{ color: '#526074', textDecoration: 'none' }}>{c.label}</Link> : c.label}</Text>)}
              </Text>
            )}
          </View>
        ) : (
          <View style={{ flexDirection: photo && !centered ? 'row' : 'column', alignItems: photo && !centered ? 'center' : 'stretch', gap: photo ? (fit ? 12 : 16) : 0 }}>
            {photo && <Image src={photo.source} style={{ width: m.photoSize, height: m.photoSize, borderRadius: photo.shape === 'circle' ? m.photoSize / 2 : 6, alignSelf: centered ? 'center' : 'flex-start' }} />}
            <View style={photo && !centered ? { flex: 1 } : {}}>
              <Text style={{ fontSize: m.headerNameSize, lineHeight: 1.25, fontFamily: m.bold, color: '#172337', textAlign: centered ? 'center' : 'left' }}>{fullName(profile) || 'Your name'}</Text>
              {Boolean(headline(profile)) && <Text style={{ fontSize: m.headerHeadlineSize, lineHeight: 1.4, color: theme.accentColor, marginTop: fit ? 3 : 5, textAlign: centered ? 'center' : 'left' }}>{headline(profile)}</Text>}
              {contactItems(profile).length > 0 && (
                <View style={m.framedContactBar ? { marginTop: fit ? 5 : 8, paddingVertical: 4, borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: '#CBD5E1' } : { marginTop: fit ? 5 : 8 }}>
                  <Text style={{ fontSize: m.headerContactSize, lineHeight: 1.45, color: '#526074', textAlign: centered ? 'center' : 'left' }}>{contactItems(profile).map((c, idx) => <Text key={idx}>{idx > 0 ? '  ·  ' : ''}{c.url ? <Link src={c.url} style={{ color: '#526074', textDecoration: 'none' }}>{c.label}</Link> : c.label}</Text>)}</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
      {resumeBlocks(profile).map(block => {
        const blockKey = `measure-block-${block.id}`;
        const sectionBreak = !measuring && profile.pageLayout?.sections?.[block.id] === 'new-page';
        // An explicit per-entry page break is a deliberate split: never override it.
        const manualEntryBreak = block.items.some(item => item.entryId && profile.pageLayout?.entries?.[item.entryId] === 'new-page');
        const blockHeight = measurements?.heights[blockKey];
        // Keep compact sections (<= 42% of page height) intact while letting
        // longer multi-entry sections flow cleanly across pages with (continued) headings.
        const keepTogether = !measuring && !manualEntryBreak && blockHeight !== undefined && blockHeight <= bodyHeight * 0.42;
        const points = continued[block.id] ?? { items: [] as number[], bullets: {} as Record<number, number[]> };
        const heading = <Text minPresenceAhead={28} style={titleStyle}>{`${block.title} (continued)`}</Text>;
        if (block.id === 'certifications' && Boolean(theme.compactCertifications)) {
          type CertCell = { item: typeof block.items[number]; index: number };
          const rows: { items: CertCell[]; manualBreak: boolean }[] = [];
          let currentRow: CertCell[] = [];
          let pendingBreak = false;
          for (let i = 0; i < block.items.length; i++) {
            const item = block.items[i];
            const mode = item.entryId ? profile.pageLayout?.entries?.[item.entryId] || 'auto' : 'auto';
            if (!measuring && mode === 'new-page') {
              if (currentRow.length) { rows.push({ items: currentRow, manualBreak: pendingBreak }); currentRow = []; pendingBreak = false; }
              pendingBreak = true;
            }
            currentRow.push({ item, index: i });
            if (currentRow.length === 2) {
              rows.push({ items: currentRow, manualBreak: pendingBreak });
              currentRow = []; pendingBreak = false;
            }
          }
          if (currentRow.length) rows.push({ items: currentRow, manualBreak: pendingBreak });
          if (rows.length && !measuring && sectionBreak && !keepTogether) rows[0].manualBreak = true;

          const compactRows = rows.map((row, rowIndex) => {
            const isLastRow = rowIndex === rows.length - 1;
            const showContinued = row.items.some(cell => points.items.includes(cell.index));
            const rowEl = (
              <View key={`cert-row-${rowIndex}`} wrap={measuring} style={{ marginBottom: isLastRow ? Math.max(fit ? 7 : 10, m.gap - 4) : (fit ? 4 : 6) }}>
                {rowIndex === 0 && <Text minPresenceAhead={35} style={titleStyle}>{block.title}</Text>}
                {rowIndex > 0 && showContinued && heading}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {row.items.map(({ item, index }) => {
                    const key = `measure-entry-${block.id}-${index}`;
                    const meta = [item.subtitle, item.date].filter(Boolean).join(' · ');
                    return (
                      <View key={key} id={key} style={{ flex: 1 }}>
                        <View id={`${key}-start`}>
                          {Boolean(item.title) && <Text style={{ fontFamily: m.bold, fontSize: Math.max(8, m.size - 0.5), color: '#172337' }}>{item.title}</Text>}
                          {Boolean(meta) && <Text style={{ fontSize: Math.max(7.5, m.size - 1.5), color: '#526074', marginTop: 1.5 }}>{meta}</Text>}
                        </View>
                      </View>
                    );
                  })}
                  {row.items.length === 1 && <View style={{ flex: 1 }} />}
                </View>
              </View>
            );
            return row.manualBreak ? <View key={`cert-row-${rowIndex}`} break>{rowEl}</View> : rowEl;
          });
          if (!measuring && manualEntryBreak) return <Fragment key={block.id}>{compactRows}</Fragment>;
          return <View key={block.id} id={blockKey} break={sectionBreak && keepTogether} wrap={!keepTogether}>{compactRows}</View>;
        }
        if (block.id === 'skills') {
          const skillRows = block.items.map((item, i) => {
            const key = `measure-entry-${block.id}-${i}`;
            const isLast = i === block.items.length - 1;
            const manualBreak = !measuring && i === 0 && sectionBreak && !keepTogether;
            const canKeepRow = !measuring && fits(key, points.items.includes(i) ? bodyHeight - 40 : bodyHeight - 2);
            return (
              <View key={key} id={key} break={manualBreak} wrap={!canKeepRow} style={{ marginBottom: isLast ? Math.max(fit ? 7 : 10, m.gap - 4) : (fit ? 2.5 : 4) }}>
                <View id={`${key}-start`}>
                  {i === 0 && <Text minPresenceAhead={35} style={titleStyle}>{block.title}</Text>}
                  {i > 0 && points.items.includes(i) && heading}
                  <Text orphans={2} widows={2}>
                    {Boolean(item.title) && <Text style={{ fontFamily: m.bold, color: '#172337' }}>{`${item.title}: `}</Text>}
                    {item.text || ''}
                  </Text>
                </View>
              </View>
            );
          });
          return keepTogether
            ? <View key={block.id} id={blockKey} wrap={false} break={sectionBreak}>{skillRows}</View>
            : <View key={block.id} id={blockKey}>{skillRows}</View>;
        }
        const items = block.items.map((item, i) => {
          const key = `measure-entry-${block.id}-${i}`;
          const startKey = `${key}-start`;
          const mode = item.entryId ? profile.pageLayout?.entries?.[item.entryId] || 'auto' : 'auto';
          const manualBreak = !measuring && (mode === 'new-page' || (i === 0 && sectionBreak && !keepTogether));
          const together = !measuring && fits(key, mode === 'together' || mode === 'new-page' ? bodyHeight - 2 : bodyHeight * 0.35);
          const bullet = (text: string, j: number) => {
            const row = <View key={j} id={`${key}-bullet-${j}`} wrap={measuring || !fits(`${key}-bullet-${j}`)} style={{ flexDirection: 'row', marginTop: m.bulletGap }}><Text style={{ width: 11, color: m.bulletColor }}>•</Text><Text orphans={2} widows={2} style={{ flex: 1 }}>{text}</Text></View>;
            // Heading and first continued bullet move as one unit, so the
            // heading can never strand at the bottom of the previous page.
            // A very long bullet must remain splittable; don't put it in an
            // unbreakable heading group unless both can fit on a page.
            const canGroup = fits(`${key}-bullet-${j}`, bodyHeight - 40);
            return points.bullets[i]?.includes(j) && canGroup ? <View key={j} wrap={false}>{heading}{row}</View> : row;
          };
          const card = <View key={key} id={key} wrap={!together} style={{ marginBottom: i === block.items.length - 1 ? Math.max(fit ? 7 : 10, m.gap - 4) : m.itemGap }}>
            <View id={startKey} wrap={measuring || !fits(startKey, points.items.includes(i) ? bodyHeight - 40 : bodyHeight - 2)}>
              {i === 0 && <Text minPresenceAhead={35} style={titleStyle}>{block.title}</Text>}
              {points.items.includes(i) && heading}
              <View minPresenceAhead={item.text || item.bullets?.length ? 32 : 0}>
                {Boolean(item.title || item.date) && <View minPresenceAhead={20} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 14 }}>
                  <Text style={{ fontFamily: m.bold, color: '#172337', flex: 1 }}>
                    {item.title}
                    {m.singleLineEntryHeader && Boolean(item.title && (item.subtitle || item.urlLabel)) && (
                      <Text style={{ fontFamily: m.font, color: '#526074', fontSize: m.size - 0.5 }}>
                        {' — '}
                        {item.subtitle || ''}
                        {Boolean(item.subtitle && item.urlLabel) && ' · '}
                        {item.url ? <Link src={item.url} style={{ color: '#526074', textDecoration: 'none' }}>{item.urlLabel}</Link> : (item.urlLabel || '')}
                      </Text>
                    )}
                  </Text>
                  {Boolean(item.date) && <Text style={{ fontSize: Math.min(9, Math.max(7.5, m.size - 1)), color: '#526074', maxWidth: '38%', textAlign: 'right' }}>{item.date}</Text>}
                </View>}
                {Boolean(item.subtitle || item.urlLabel) && !(m.singleLineEntryHeader && item.title) && <Text style={{ color: '#526074', fontSize: m.size - 1, marginTop: 2, ...(m.subtitleItalic ? { fontFamily: m.italic } : {}) }}>
                  {item.subtitle || ''}
                  {Boolean(item.subtitle && item.urlLabel) && ' · '}
                  {item.url ? <Link src={item.url} style={{ color: '#526074', textDecoration: 'none' }}>{item.urlLabel}</Link> : (item.urlLabel || '')}
                </Text>}
              </View>
              {Boolean(item.text) && <Text orphans={3} widows={2} style={{ marginTop: item.title ? 5 : 0 }}>{item.text}</Text>}
              {Boolean(item.bullets?.length) && bullet(item.bullets![0], 0)}
            </View>
            {item.bullets?.slice(1).map((text, j) => bullet(text, j + 1))}
          </View>;
          return manualBreak ? <View key={key} break>{card}</View> : card;
        });
        // The block wrapper also measures total section height across page fragments.
        if (!measuring && manualEntryBreak) return <Fragment key={block.id}>{items}</Fragment>;
        return keepTogether
          ? <View key={block.id} id={blockKey} wrap={false} break={sectionBreak}>{items}</View>
          : <View key={block.id} id={blockKey}>{items}</View>;
      })}
    </Page>
  </Document>;
}
