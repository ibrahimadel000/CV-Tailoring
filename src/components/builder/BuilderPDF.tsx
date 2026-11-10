import { Document, Image, Page, Text, View } from '@react-pdf/renderer';
import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { visiblePhoto } from './photoModel';
import { contacts, fullName, headline, resumeBlocks, themeMetrics } from './resumeModel';

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
  const classic = theme.layoutStyle === 'classic';
  const photo = visiblePhoto(profile);
  const bodyHeight = 841.89 - m.margin * 2;
  const fits = (key: string, limit = bodyHeight - 2) => Boolean(measurements?.heights[key] && measurements.heights[key] <= limit);
  const measuring = !measurements;
  const continued = continuations === null ? {} : continuations ?? deriveContinuations(profile, measurements);
  const titleStyle = { fontFamily: m.bold, fontSize: 10, textTransform: 'uppercase' as const, color: theme.accentColor, marginBottom: 8 };
  return <Document title={profile.profileName} author={fullName(profile)} onRender={onMeasure ? result => { const data = (result as unknown as { _INTERNAL__LAYOUT__DATA_?: PDFLayoutNode })._INTERNAL__LAYOUT__DATA_; if (data) onMeasure(data); } : undefined}>
    <Page size="A4" style={{ padding: m.margin, fontFamily: m.font, fontSize: m.size, color: '#243044', lineHeight: m.leading }}>
      <View id="measure-header" style={{ paddingBottom: 16, marginBottom: m.gap, borderBottomWidth: classic ? 1 : 2, borderBottomColor: theme.accentColor }}>
        <View style={{ flexDirection: photo && !classic ? 'row' : 'column', alignItems: photo && !classic ? 'center' : 'stretch', gap: photo ? 16 : 0 }}>
          {photo && <Image src={photo.source} style={{ width: 72, height: 72, borderRadius: photo.shape === 'circle' ? 36 : 6, alignSelf: classic ? 'center' : 'flex-start' }} />}
          <View style={photo && !classic ? { flex: 1 } : {}}>
            <Text style={{ fontSize: 27, lineHeight: 1.25, fontFamily: m.bold, color: '#172337', textAlign: classic ? 'center' : 'left' }}>{fullName(profile) || 'Your name'}</Text>
            {Boolean(headline(profile)) && <Text style={{ fontSize: 12, lineHeight: 1.45, color: theme.accentColor, marginTop: 5, textAlign: classic ? 'center' : 'left' }}>{headline(profile)}</Text>}
            {contacts(profile).length > 0 && <Text style={{ marginTop: 8, fontSize: 9, lineHeight: 1.5, color: '#526074', textAlign: classic ? 'center' : 'left' }}>{contacts(profile).join('  ·  ')}</Text>}
          </View>
        </View>
      </View>
      {resumeBlocks(profile).map(block => {
        const blockKey = `measure-block-${block.id}`;
        const sectionBreak = !measuring && profile.pageLayout?.sections?.[block.id] === 'new-page';
        // An explicit per-entry page break is a deliberate split: never override it.
        const manualEntryBreak = block.items.some(item => item.entryId && profile.pageLayout?.entries?.[item.entryId] === 'new-page');
        const blockHeight = measurements?.heights[blockKey];
        // A section that fits on one page is never straddled: it moves whole to
        // the next page instead of leaving one orphaned entry behind.
        const keepTogether = !measuring && !manualEntryBreak && blockHeight !== undefined && blockHeight <= bodyHeight - 2;
        const points = continued[block.id] ?? { items: [] as number[], bullets: {} as Record<number, number[]> };
        const heading = <Text minPresenceAhead={28} style={titleStyle}>{`${block.title} (continued)`}</Text>;
        const items = block.items.map((item, i) => {
          const key = `measure-entry-${block.id}-${i}`;
          const startKey = `${key}-start`;
          const mode = item.entryId ? profile.pageLayout?.entries?.[item.entryId] || 'auto' : 'auto';
          const manualBreak = !measuring && (mode === 'new-page' || (i === 0 && sectionBreak && !keepTogether));
          const together = !measuring && fits(key, mode === 'together' || mode === 'new-page' ? bodyHeight - 2 : bodyHeight * 0.6);
          const bullet = (text: string, j: number) => {
            const row = <View key={j} id={`${key}-bullet-${j}`} wrap={measuring || !fits(`${key}-bullet-${j}`)} style={{ flexDirection: 'row', marginTop: 4 }}><Text style={{ width: 11 }}>•</Text><Text orphans={2} widows={2} style={{ flex: 1 }}>{text}</Text></View>;
            // Heading and first continued bullet move as one unit, so the
            // heading can never strand at the bottom of the previous page.
            // A very long bullet must remain splittable; don't put it in an
            // unbreakable heading group unless both can fit on a page.
            const canGroup = fits(`${key}-bullet-${j}`, bodyHeight - 40);
            return points.bullets[i]?.includes(j) && canGroup ? <View key={j} wrap={false}>{heading}{row}</View> : row;
          };
          return <View key={key} id={key} break={manualBreak} wrap={!together} style={{ marginBottom: i === block.items.length - 1 ? m.gap : 11 }}>
            <View id={startKey} wrap={measuring || !fits(startKey, points.items.includes(i) ? bodyHeight - 40 : bodyHeight - 2)}>
              {i === 0 && <Text minPresenceAhead={35} style={titleStyle}>{block.title}</Text>}
              {points.items.includes(i) && heading}
              <View minPresenceAhead={item.text || item.bullets?.length ? 32 : 0}>
                {Boolean(item.title || item.date) && <View minPresenceAhead={20} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 14 }}>
                  <Text style={{ fontFamily: m.bold, flex: 1 }}>{item.title}</Text>
                  {Boolean(item.date) && <Text style={{ fontSize: 9, color: '#526074', maxWidth: '38%' }}>{item.date}</Text>}
                </View>}
                {Boolean(item.subtitle) && <Text style={{ color: '#526074', fontSize: m.size - 1, marginTop: 2 }}>{item.subtitle}</Text>}
              </View>
              {Boolean(item.text) && <Text orphans={3} widows={2} style={{ marginTop: item.title ? 5 : 0 }}>{item.text}</Text>}
              {Boolean(item.bullets?.length) && bullet(item.bullets![0], 0)}
            </View>
            {item.bullets?.slice(1).map((text, j) => bullet(text, j + 1))}
          </View>;
        });
        // The block wrapper also measures total section height across page fragments.
        return keepTogether
          ? <View key={block.id} id={blockKey} wrap={false} break={sectionBreak}>{items}</View>
          : <View key={block.id} id={blockKey}>{items}</View>;
      })}
    </Page>
  </Document>;
}
