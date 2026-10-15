import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { contacts, fullName, headline, resumeBlocks, themeMetrics } from './resumeModel';

export function BuilderPDF({ profile, theme }: { profile: CVProfile; theme: DocumentTheme }) {
  const m = themeMetrics(theme);
  const classic = theme.layoutStyle === 'classic';
  return <Document title={profile.profileName} author={fullName(profile)}>
    <Page size="A4" style={{ padding: m.margin, fontFamily: m.font, fontSize: m.size, color: '#243044', lineHeight: m.leading }}>
      <View style={{ paddingBottom: 16, marginBottom: m.gap, borderBottomWidth: classic ? 1 : 2, borderBottomColor: theme.accentColor }}>
        <Text style={{ fontSize: 27, lineHeight: 1.25, fontFamily: m.bold, color: '#172337', textAlign: classic ? 'center' : 'left' }}>{fullName(profile) || 'Your name'}</Text>
        {headline(profile) && <Text style={{ fontSize: 12, lineHeight: 1.45, color: theme.accentColor, marginTop: 5, textAlign: classic ? 'center' : 'left' }}>{headline(profile)}</Text>}
        {contacts(profile).length > 0 && <Text style={{ marginTop: 8, fontSize: 9, lineHeight: 1.5, color: '#526074', textAlign: classic ? 'center' : 'left' }}>{contacts(profile).join('  ·  ')}</Text>}
      </View>
      {resumeBlocks(profile).map(block => <View key={block.id} style={{ marginBottom: m.gap }}>
        {block.items.map((item, i) => <View key={i} wrap={[(item.title || ''), (item.subtitle || ''), (item.text || ''), ...(item.bullets || [])].join(' ').length > 450 || (item.text || '').split('\n').length > 6 || (item.bullets?.length || 0) > 3} style={{ marginBottom: i === block.items.length - 1 ? 0 : 11 }}>
          {i === 0 && <Text minPresenceAhead={70} style={{ fontFamily: m.bold, fontSize: 10, textTransform: 'uppercase', color: theme.accentColor, marginBottom: 8 }}>{block.title}</Text>}
          {(item.title || item.date) && <View minPresenceAhead={25} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 14 }}>
            <Text style={{ fontFamily: m.bold, flex: 1 }}>{item.title}</Text>
            {item.date && <Text style={{ fontSize: 9, color: '#526074', maxWidth: '38%' }}>{item.date}</Text>}
          </View>}
          {item.subtitle && <Text style={{ color: '#526074', fontSize: m.size - 1, marginTop: 2 }}>{item.subtitle}</Text>}
          {item.text && <Text style={{ marginTop: item.title ? 5 : 0 }}>{item.text}</Text>}
          {item.bullets?.map((bullet, j) => <View key={j} style={{ flexDirection: 'row', marginTop: 4 }}><Text style={{ width: 11 }}>•</Text><Text style={{ flex: 1 }}>{bullet}</Text></View>)}
        </View>)}
      </View>)}
    </Page>
  </Document>;
}
