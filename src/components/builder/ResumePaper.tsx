import type { CSSProperties } from 'react';
import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { visiblePhoto } from './photoModel';
import { contactItems, fullName, headline, resumeBlocks, themeMetrics, type SectionId } from './resumeModel';

export function ResumePaper({ profile, theme, onEdit }: { profile: CVProfile; theme: DocumentTheme; onEdit: (id: SectionId) => void }) {
  const m = themeMetrics(theme);
  const centered = m.centeredHeader;
  const photo = visiblePhoto(profile);
  const font = theme.fontFamily === 'serif' ? 'Times New Roman, serif' : theme.fontFamily === 'mono' ? 'Courier New, monospace' : 'Arial, sans-serif';
  const ptToPx = (pt: number) => Number(((pt * 4) / 3).toFixed(2));
  const paperStyle = {
    width: ptToPx(m.pageWidthPt),
    minHeight: ptToPx(m.pageHeightPt),
    padding: ptToPx(m.margin),
    fontFamily: font,
    fontSize: ptToPx(m.size),
    lineHeight: m.leading,
    '--bullet-color': m.bulletColor,
  } as CSSProperties;
  const headerContacts = contactItems(profile);
  const blocks = resumeBlocks(profile);
  const hasFramedContacts = m.framedContactBar && headerContacts.length > 0;
  const showContacts = headerContacts.length > 0 || blocks.length === 0;
  const sidePhotoWithContacts = Boolean(photo && !centered && !m.splitHeader);

  const contactsEl = showContacts ? (
    <p className={`paper-contacts ${hasFramedContacts ? 'paper-framed-contacts' : ''}`} style={{ fontSize: ptToPx(m.headerContactSize), lineHeight: 1.45 }}>
      {headerContacts.length > 0
        ? headerContacts.map((c, idx) => (
            <span key={idx}>
              {idx > 0 ? '  ·  ' : ''}
              {c.url ? (
                <a className="paper-link" href={c.url} target="_blank" rel="noopener noreferrer">
                  {c.label}
                </a>
              ) : c.label}
            </span>
          ))
        : 'Your contact details will appear here'}
    </p>
  ) : null;

  return <article dir="auto" className={`resume-paper ${theme.fitOnePage ? 'paper-fit-one-page' : ''}`} aria-label="Live resume preview" style={paperStyle}>
    <header data-resume-section="personal"
      className={`paper-header ${m.splitHeader ? 'paper-split-header' : ''}`}
      style={{
        textAlign: centered ? 'center' : 'start',
        paddingBottom: hasFramedContacts ? 4 : ptToPx(m.headerPadBottom),
        ...(hasFramedContacts ? {} : { borderBottom: `${centered ? 1 : m.splitHeader ? 1.5 : 2}px solid ${theme.accentColor}` }),
        marginBottom: ptToPx(Math.max(theme.fitOnePage ? 7 : 10, m.gap - 4)),
      }}
    >
      {sidePhotoWithContacts ? (
        <div className="paper-photo-header has-photo">
          <button type="button" className="paper-edit" onClick={() => onEdit('personal')} aria-label="Edit personal details from preview" style={{ flex: '0 0 auto' }}>
            <img className={`paper-photo photo-${photo!.shape}`} src={photo!.source} alt="Your resume photo" style={{ width: ptToPx(m.photoSize), height: ptToPx(m.photoSize) }} />
          </button>
          <div className="paper-header-col">
            <button type="button" className="paper-edit" onClick={() => onEdit('personal')} aria-label="Edit personal details from preview" style={{ width: '100%', textAlign: 'start' }}>
              <span className="paper-header-text">
                <span className="paper-name" style={{ display: 'block', fontSize: ptToPx(m.headerNameSize), lineHeight: 1.25, fontWeight: 700, color: '#172337', letterSpacing: '-0.5px' }}>{fullName(profile) || 'Your name'}</span>
                {headline(profile) && <span className="paper-headline" style={{ display: 'block', color: theme.accentColor, fontSize: ptToPx(m.headerHeadlineSize), lineHeight: 1.4 }}>{headline(profile)}</span>}
              </span>
            </button>
            {contactsEl}
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="paper-edit" onClick={() => onEdit('personal')} aria-label="Edit personal details from preview" style={{ width: m.splitHeader ? 'auto' : '100%', flex: m.splitHeader ? 1 : undefined, minWidth: 0, textAlign: centered ? 'center' : 'start' }}>
            <span className={`paper-photo-header ${centered ? 'paper-photo-classic' : ''} ${photo ? 'has-photo' : ''}`}>
              {photo && <img className={`paper-photo photo-${photo.shape}`} src={photo.source} alt="Your resume photo" style={{ width: ptToPx(m.photoSize), height: ptToPx(m.photoSize) }} />}
              <span className="paper-header-text">
                <span className="paper-name" style={{ display: 'block', fontSize: ptToPx(m.headerNameSize), lineHeight: 1.25, fontWeight: 700, color: '#172337', letterSpacing: '-0.5px' }}>{fullName(profile) || 'Your name'}</span>
                {headline(profile) && <span className="paper-headline" style={{ display: 'block', color: theme.accentColor, fontSize: ptToPx(m.headerHeadlineSize), lineHeight: 1.4 }}>{headline(profile)}</span>}
              </span>
            </span>
          </button>
          {contactsEl}
        </>
      )}
    </header>
    {blocks.map(block => <section data-resume-section={block.id} key={block.id} style={{ marginBottom: ptToPx(Math.max(theme.fitOnePage ? 7 : 10, m.gap - 4)) }}>
      <button type="button" className="paper-section-title paper-edit" onClick={() => onEdit(block.id)} style={{ color: theme.accentColor, fontSize: ptToPx(m.sectionTitleSize), ...(m.sectionBgColor !== 'transparent' ? { backgroundColor: m.sectionBgColor, padding: '3px 8px', borderRadius: 3, width: '100%' } : { borderBottom: `1px solid ${m.sectionRuleColor}`, paddingBottom: 3, width: '100%' }) }} aria-label={`Edit ${block.title} from preview`}>{block.title}</button>
      {block.id === 'certifications' && theme.compactCertifications ? (
        <div className="paper-cert-grid">
          {block.items.map((item, i) => (
            <div key={i} className="paper-item paper-cert-compact">
              {item.title && <strong>{item.title}</strong>}
              {(item.subtitle || item.date) && <p className="paper-subtitle">{[item.subtitle, item.date].filter(Boolean).join(' · ')}</p>}
            </div>
          ))}
        </div>
      ) : block.id === 'skills' ? (
        <div className="paper-skills-inline">
          {block.items.map((item, i) => (
            <p key={i} className="paper-body" style={{ marginBottom: i === block.items.length - 1 ? 0 : (theme.fitOnePage ? 3 : 5) }}>
              {item.title && <strong>{item.title}: </strong>}
              {item.text}
            </p>
          ))}
        </div>
      ) : block.items.map((item, i) => <div key={i} className="paper-item" style={{ marginBottom: i === block.items.length - 1 ? 0 : ptToPx(m.itemGap) }}>
        {(item.title || item.date) && (
          <div className="paper-item-heading">
            <strong>
              {item.title}
              {m.singleLineEntryHeader && Boolean(item.title && (item.subtitle || item.urlLabel)) && (
                <span style={{ fontWeight: 400, color: '#526074', fontSize: '0.94em' }}>
                  {' — '}
                  {item.subtitle || ''}
                  {Boolean(item.subtitle && item.urlLabel) && ' · '}
                  {item.url ? (
                    <a className="paper-link" href={item.url} target="_blank" rel="noopener noreferrer">
                      {item.urlLabel}
                    </a>
                  ) : (item.urlLabel || '')}
                </span>
              )}
            </strong>
            <span>{item.date}</span>
          </div>
        )}
        {(item.subtitle || item.urlLabel) && !(m.singleLineEntryHeader && item.title) && (
          <p className="paper-subtitle" style={m.subtitleItalic ? { fontStyle: 'italic' } : undefined}>
            {item.subtitle || ''}
            {Boolean(item.subtitle && item.urlLabel) && ' · '}
            {item.url ? (
              <a className="paper-link" href={item.url} target="_blank" rel="noopener noreferrer">
                {item.urlLabel}
              </a>
            ) : (item.urlLabel || '')}
          </p>
        )}
        {item.text && <p className="paper-body" style={{ marginTop: item.title ? 6 : 0 }}>{item.text}</p>}
        {item.bullets && item.bullets.length > 0 && <ul>{item.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
      </div>)}
    </section>)}
    {!blocks.length && <div className="paper-placeholder"><span>YOUR NEXT CHAPTER</span><h2>A little about you.<br />A world of possibilities.</h2><p>Add your details on the left. Your resume takes shape here, one section at a time.</p><div /><div /><div /></div>}
  </article>;
}
