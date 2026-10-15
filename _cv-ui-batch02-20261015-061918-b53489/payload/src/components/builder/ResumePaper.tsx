import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { contacts, fullName, headline, resumeBlocks, themeMetrics, type SectionId } from './resumeModel';

export function ResumePaper({ profile, theme, onEdit }: { profile: CVProfile; theme: DocumentTheme; onEdit: (id: SectionId) => void }) {
  const m = themeMetrics(theme);
  const classic = theme.layoutStyle === 'classic';
  const font = theme.fontFamily === 'serif' ? 'Times New Roman, serif' : theme.fontFamily === 'mono' ? 'Courier New, monospace' : 'Arial, sans-serif';
  return <article className="resume-paper" aria-label="Live resume preview" style={{ padding: m.margin * 4 / 3, fontFamily: font, fontSize: m.size * 4 / 3, lineHeight: m.leading }}>
    <button data-resume-section="personal" className="paper-header paper-edit" onClick={() => onEdit('personal')} aria-label="Edit personal details from preview" style={{ textAlign: classic ? 'center' : 'left', borderBottom: `${classic ? 1 : 2}px solid ${theme.accentColor}`, marginBottom: m.gap * 4 / 3 }}>
      <h1>{fullName(profile) || 'Your name'}</h1>
      {headline(profile) && <p className="paper-headline" style={{ color: theme.accentColor }}>{headline(profile)}</p>}
      <p className="paper-contacts">{contacts(profile).join('  ·  ') || 'Your contact details will appear here'}</p>
    </button>
    {resumeBlocks(profile).map(block => <section data-resume-section={block.id} key={block.id} style={{ marginBottom: m.gap * 4 / 3 }}>
      <button className="paper-section-title paper-edit" onClick={() => onEdit(block.id)} style={{ color: theme.accentColor }} aria-label={`Edit ${block.title} from preview`}>{block.title}</button>
      {block.items.map((item, i) => <div key={i} className="paper-item" style={{ marginBottom: i === block.items.length - 1 ? 0 : 14 }}>
        {(item.title || item.date) && <div className="paper-item-heading"><strong>{item.title}</strong><span>{item.date}</span></div>}
        {item.subtitle && <p className="paper-subtitle">{item.subtitle}</p>}
        {item.text && <p className="paper-body" style={{ marginTop: item.title ? 6 : 0 }}>{item.text}</p>}
        {item.bullets && item.bullets.length > 0 && <ul>{item.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
      </div>)}
    </section>)}
    {!resumeBlocks(profile).length && <div className="paper-placeholder"><span>YOUR NEXT CHAPTER</span><h2>A little about you.<br />A world of possibilities.</h2><p>Add your details on the left. Your resume takes shape here, one section at a time.</p><div /><div /><div /></div>}
  </article>;
}
