import { Document, Image, Page, Text, View } from '@react-pdf/renderer';
import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { visiblePhoto } from './photoModel';
import { contacts, fullName, headline, resumeBlocks, themeMetrics } from './resumeModel';

// A first, naturally wrapped render measures the real font/layout heights. Never
// disable wrapping on a guessed character count: an oversized entry must flow.
export type PDFMeasurements = Record<string, number>;
export interface PDFLayoutNode { props?: { id?: string }; box?: { height?: number }; children?: PDFLayoutNode[] }
export function measurePDFLayout(node: PDFLayoutNode): PDFMeasurements {
  const heights: PDFMeasurements = {};
  const visit = (n: PDFLayoutNode) => {
    const id = n.props?.id; const height = n.box?.height;
    if (id?.startsWith('measure-') && typeof height === 'number' && Number.isFinite(height)) heights[id] = (heights[id] || 0) + height;
    n.children?.forEach(visit);
  };
  visit(node); return heights;
}
export function BuilderPDF({ profile, theme, measurements, onMeasure }: { profile: CVProfile; theme: DocumentTheme; measurements?: PDFMeasurements; onMeasure?: (node: PDFLayoutNode) => void }) {
  const m = themeMetrics(theme);
  const classic = theme.layoutStyle === 'classic';
  const photo = visiblePhoto(profile);
  const bodyHeight = 841.89 - m.margin * 2;
  const fits = (key: string, limit = bodyHeight - 2) => Boolean(measurements?.[key] && measurements[key] <= limit);
  const measuring = !measurements;
  return <Document title={profile.profileName} author={fullName(profile)} onRender={onMeasure ? result => { const data = (result as unknown as { _INTERNAL__LAYOUT__DATA_?: PDFLayoutNode })._INTERNAL__LAYOUT__DATA_; if (data) onMeasure(data); } : undefined}>
    <Page size="A4" style={{ padding: m.margin, fontFamily: m.font, fontSize: m.size, color: '#243044', lineHeight: m.leading }}>
      <View style={{ paddingBottom: 16, marginBottom: m.gap, borderBottomWidth: classic ? 1 : 2, borderBottomColor: theme.accentColor }}>
        <View style={{ flexDirection: photo && !classic ? 'row' : 'column', alignItems: photo && !classic ? 'center' : 'stretch', gap: photo ? 16 : 0 }}>
          {photo && <Image src={photo.source} style={{ width: 72, height: 72, borderRadius: photo.shape === 'circle' ? 36 : 6, alignSelf: classic ? 'center' : 'flex-start' }} />}
          <View style={photo && !classic ? { flex: 1 } : {}}>
            <Text style={{ fontSize: 27, lineHeight: 1.25, fontFamily: m.bold, color: '#172337', textAlign: classic ? 'center' : 'left' }}>{fullName(profile) || 'Your name'}</Text>
            {Boolean(headline(profile)) && <Text style={{ fontSize: 12, lineHeight: 1.45, color: theme.accentColor, marginTop: 5, textAlign: classic ? 'center' : 'left' }}>{headline(profile)}</Text>}
            {contacts(profile).length > 0 && <Text style={{ marginTop: 8, fontSize: 9, lineHeight: 1.5, color: '#526074', textAlign: classic ? 'center' : 'left' }}>{contacts(profile).join('  ·  ')}</Text>}
          </View>
        </View>
      </View>
      {resumeBlocks(profile).flatMap(block => block.items.map((item, i) => {
        const key = `measure-entry-${block.id}-${i}`;
        const startKey = `${key}-start`;
        const mode = item.entryId ? profile.pageLayout?.entries?.[item.entryId] || 'auto' : 'auto';
        const manualBreak = !measuring && (mode === 'new-page' || (i === 0 && profile.pageLayout?.sections?.[block.id] === 'new-page'));
        const together = !measuring && fits(key, mode === 'together' || mode === 'new-page' ? bodyHeight - 2 : bodyHeight * 0.6);
        const bullet = (text: string, j: number) => <View key={j} id={measuring ? `${key}-bullet-${j}` : undefined} wrap={measuring || !fits(`${key}-bullet-${j}`)} style={{ flexDirection: 'row', marginTop: 4 }}><Text style={{ width: 11 }}>•</Text><Text orphans={2} widows={2} style={{ flex: 1 }}>{text}</Text></View>;
        return <View key={key} id={measuring ? key : undefined} break={manualBreak} wrap={!together} style={{ marginBottom: i === block.items.length - 1 ? m.gap : 11 }}>
          <View id={measuring ? startKey : undefined} wrap={measuring || !fits(startKey)}>
            {i === 0 && <Text minPresenceAhead={35} style={{ fontFamily: m.bold, fontSize: 10, textTransform: 'uppercase', color: theme.accentColor, marginBottom: 8 }}>{block.title}</Text>}
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
      }))}
    </Page>
  </Document>;
}
