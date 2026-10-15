import type { CVProfile } from '@/types/schema';
import { useAppStore } from '@/store/useAppStore';
import { Mail, Phone, MapPin, Linkedin, Github, Globe } from 'lucide-react';

interface ResumeHTMLDocumentProps {
  profile: CVProfile;
  fontFamily?: 'sans' | 'serif' | 'mono';
  onSectionClick?: (section: string) => void;
}

export function ResumeHTMLDocument({
  profile,
  fontFamily: propFontFamily,
  onSectionClick,
}: ResumeHTMLDocumentProps) {
  const storeTheme = useAppStore((s) => s.documentTheme);
  const accentColor = storeTheme?.accentColor || '#b87373';
  const effectiveFont = propFontFamily || storeTheme?.fontFamily || 'sans';
  const lineSpacing = storeTheme?.lineSpacing || 'normal';
  const fontSize = storeTheme?.fontSize || 'medium';
  const layoutStyle = storeTheme?.layoutStyle || 'modern';

  const header = profile.resumeHeader.data;
  const fullName = header.firstName || header.lastName
    ? `${header.firstName || ''} ${header.lastName || ''}`.trim()
    : header.name || 'Your Full Name';

  const techSkills = profile.skills.data.filter(s => s.category === 'Technical');
  const toolSkills = profile.skills.data.filter(s => s.category === 'Tools');
  const softSkills = profile.skills.data.filter(s => s.category === 'Soft');
  const langSkills = profile.skills.data.filter(s => s.category === 'Languages');

  const fontClass = effectiveFont === 'serif' 
    ? 'font-serif' 
    : effectiveFont === 'mono'
      ? 'font-mono'
      : 'font-sans';

  // Professional Typography Scales
  const fontSizes = {
    small: {
      body: 'text-[13.5px]',
      name: 'text-2xl md:text-3xl',
      sectionHeading: 'text-[13px]',
      itemHeading: 'text-[15px]',
      subHeading: 'text-[13.5px]',
      label: 'text-[12px]',
      meta: 'text-[12px]',
    },
    medium: {
      body: 'text-[14.5px]',
      name: 'text-3xl md:text-4xl',
      sectionHeading: 'text-[14px]',
      itemHeading: 'text-[16px]',
      subHeading: 'text-[14.5px]',
      label: 'text-[12.5px]',
      meta: 'text-[13px]',
    },
    large: {
      body: 'text-[16px]',
      name: 'text-4xl md:text-5xl',
      sectionHeading: 'text-[15px]',
      itemHeading: 'text-[18px]',
      subHeading: 'text-[16px]',
      label: 'text-[13.5px]',
      meta: 'text-[14px]',
    },
  }[fontSize];

  // Professional Spacing Scales
  const spacingStyles = {
    compact: {
      padding: 'p-8 md:p-12',
      sectionMargin: 'mb-7',
      itemGap: 'space-y-4',
      textLeading: 'leading-[1.6]',
      bulletGap: 'space-y-1.5',
    },
    normal: {
      padding: 'p-10 md:p-16',
      sectionMargin: 'mb-10',
      itemGap: 'space-y-5',
      textLeading: 'leading-[1.7]',
      bulletGap: 'space-y-2',
    },
    relaxed: {
      padding: 'p-12 md:p-20',
      sectionMargin: 'mb-14',
      itemGap: 'space-y-7',
      textLeading: 'leading-[1.85]',
      bulletGap: 'space-y-3',
    },
  }[lineSpacing];

  // ═════════════════════════════════════════════════════════════════
  // 1. MODERN EXECUTIVE LAYOUT (The Gold Standard for Tech & Business)
  // ═════════════════════════════════════════════════════════════════
  if (layoutStyle === 'modern') {
    return (
      <div
        className={`w-full min-h-[1140px] bg-white text-gray-900 ${spacingStyles.padding} ${fontSizes.body} ${spacingStyles.textLeading} select-text shadow-sm relative ${fontClass}`}
        style={{ maxWidth: '850px', margin: '0 auto' }}
      >
        {/* Hero Header */}
        <header
          onClick={() => onSectionClick?.('header')}
          className="cursor-pointer group transition-colors hover:bg-slate-50/70 p-3 -m-3 rounded-xl mb-8 border-b border-gray-200 pb-6"
          title="Click to edit Personal details"
        >
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h1 className={`${fontSizes.name} font-extrabold text-gray-950 tracking-tight`}>
                {fullName}
              </h1>
              {header.desiredJobPosition && (
                <p 
                  style={{ color: accentColor }}
                  className="text-base md:text-lg font-semibold tracking-wide mt-1"
                >
                  {header.desiredJobPosition}
                </p>
              )}
            </div>
          </div>

          {/* Clean Contact Ribbon */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600 mt-4">
            {header.location && (
              <span className="flex items-center gap-1.5 font-medium text-gray-700">
                <MapPin size={13} style={{ color: accentColor }} />
                {header.location}
              </span>
            )}
            {header.email && (
              <span className="flex items-center gap-1.5 font-medium text-gray-700">
                <span className="text-gray-300">•</span>
                <Mail size={13} style={{ color: accentColor }} />
                {header.email}
              </span>
            )}
            {header.phone && (
              <span className="flex items-center gap-1.5 font-medium text-gray-700">
                <span className="text-gray-300">•</span>
                <Phone size={13} style={{ color: accentColor }} />
                {header.phone}
              </span>
            )}
            {header.linkedin && (
              <span className="flex items-center gap-1.5 font-medium text-gray-700">
                <span className="text-gray-300">•</span>
                <Linkedin size={13} style={{ color: accentColor }} />
                {header.linkedin.replace(/^https?:\/\/(www\.)?/, '')}
              </span>
            )}
            {header.github && (
              <span className="flex items-center gap-1.5 font-medium text-gray-700">
                <span className="text-gray-300">•</span>
                <Github size={13} style={{ color: accentColor }} />
                {header.github.replace(/^https?:\/\/(www\.)?/, '')}
              </span>
            )}
            {header.portfolio && (
              <span className="flex items-center gap-1.5 font-medium text-gray-700">
                <span className="text-gray-300">•</span>
                <Globe size={13} style={{ color: accentColor }} />
                {header.portfolio.replace(/^https?:\/\/(www\.)?/, '')}
              </span>
            )}
          </div>
        </header>

        {/* Profile / Summary */}
        {profile.summary.data && (
          <section
            onClick={() => onSectionClick?.('summary')}
            className={`${spacingStyles.sectionMargin} cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg`}
            title="Click to edit Profile"
          >
            <h2 
              style={{ color: accentColor, borderColor: '#e5e7eb' }} 
              className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-3`}
            >
              Professional Summary
            </h2>
            <p className="text-gray-700 leading-relaxed text-justify whitespace-pre-line">
              {profile.summary.data}
            </p>
          </section>
        )}

        {/* Professional Experience */}
        {profile.experience.data.length > 0 && (
          <section
            onClick={() => onSectionClick?.('experience')}
            className={`${spacingStyles.sectionMargin} cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg`}
            title="Click to edit Employment"
          >
            <h2 
              style={{ color: accentColor, borderColor: '#e5e7eb' }} 
              className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-4`}
            >
              Experience
            </h2>

            <div className={spacingStyles.itemGap}>
              {profile.experience.data.map((exp) => (
                <div key={exp.id} className="space-y-1.5">
                  <div className="flex justify-between items-baseline gap-4">
                    <span className={`${fontSizes.itemHeading} font-bold text-gray-900`}>
                      {exp.roleTitle || 'Position'}
                    </span>
                    <span className={`${fontSizes.meta} text-gray-500 shrink-0 font-medium`}>
                      {[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}
                    </span>
                  </div>

                  <div className={`${fontSizes.subHeading} text-gray-700 font-medium`}>
                    {exp.companyName}{exp.city ? `, ${exp.city}` : ''}
                  </div>

                  {exp.description ? (
                    <p className="text-gray-700 leading-relaxed whitespace-pre-line pt-1">
                      {exp.description}
                    </p>
                  ) : (
                    <ul className={`list-disc list-outside ml-5 ${spacingStyles.bulletGap} pt-1.5 text-gray-700`}>
                      {exp.bullets.filter(b => b.text.trim()).map((b) => (
                        <li key={b.id} className="leading-relaxed pl-1">
                          {b.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Key Projects */}
        {profile.projects.data.length > 0 && (
          <section
            onClick={() => onSectionClick?.('projects')}
            className={`${spacingStyles.sectionMargin} cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg`}
            title="Click to edit Projects"
          >
            <h2 
              style={{ color: accentColor, borderColor: '#e5e7eb' }} 
              className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-4`}
            >
              Projects & Engineering Work
            </h2>

            <div className={spacingStyles.itemGap}>
              {profile.projects.data.map((proj) => (
                <div key={proj.id} className="space-y-1.5">
                  <div className="flex justify-between items-baseline gap-4">
                    <div className="flex items-center gap-2">
                      <span className={`${fontSizes.itemHeading} font-bold text-gray-900`}>{proj.name}</span>
                      {proj.role && <span className={`${fontSizes.meta} text-gray-500 font-normal`}>({proj.role})</span>}
                    </div>
                    {proj.url && (
                      <span className={`${fontSizes.meta} text-primary-600 font-medium truncate max-w-[220px]`}>
                        {proj.url.replace(/^https?:\/\/(www\.)?/, '')}
                      </span>
                    )}
                  </div>

                  <ul className={`list-disc list-outside ml-5 ${spacingStyles.bulletGap} pt-1 text-gray-700`}>
                    {proj.bullets.filter(b => b.text.trim()).map((b) => (
                      <li key={b.id} className="leading-relaxed pl-1">
                        {b.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Skills & Badges */}
        {(techSkills.length > 0 || toolSkills.length > 0 || softSkills.length > 0 || langSkills.length > 0) && (
          <section
            onClick={() => onSectionClick?.('skills')}
            className={`${spacingStyles.sectionMargin} cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg`}
            title="Click to edit Skills"
          >
            <h2 
              style={{ color: accentColor, borderColor: '#e5e7eb' }} 
              className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-4`}
            >
              Skills & Proficiencies
            </h2>

            <div className="space-y-3">
              {techSkills.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
                  <span className="font-bold text-gray-900 w-32 shrink-0 text-xs uppercase tracking-wide">Technical:</span>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {techSkills.map(s => (
                      <span key={s.id} className="px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100/80 text-gray-800 border border-gray-200">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {toolSkills.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
                  <span className="font-bold text-gray-900 w-32 shrink-0 text-xs uppercase tracking-wide">Tools & Cloud:</span>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {toolSkills.map(s => (
                      <span key={s.id} className="px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100/80 text-gray-800 border border-gray-200">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {softSkills.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
                  <span className="font-bold text-gray-900 w-32 shrink-0 text-xs uppercase tracking-wide">Soft Skills:</span>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {softSkills.map(s => (
                      <span key={s.id} className="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {langSkills.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
                  <span className="font-bold text-gray-900 w-32 shrink-0 text-xs uppercase tracking-wide">Languages:</span>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {langSkills.map(s => (
                      <span key={s.id} className="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Education & Credentials */}
        {profile.education.data.length > 0 && (
          <section
            onClick={() => onSectionClick?.('education')}
            className={`${spacingStyles.sectionMargin} cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg`}
            title="Click to edit Education"
          >
            <h2 
              style={{ color: accentColor, borderColor: '#e5e7eb' }} 
              className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-4`}
            >
              Education
            </h2>

            <div className={spacingStyles.itemGap}>
              {profile.education.data.map((edu) => (
                <div key={edu.id} className="space-y-1">
                  <div className="flex justify-between items-baseline gap-4">
                    <span className={`${fontSizes.itemHeading} font-bold text-gray-900`}>
                      {edu.degree || 'Degree'}
                    </span>
                    <span className={`${fontSizes.meta} text-gray-500 shrink-0 font-medium`}>
                      {edu.startDate && edu.endDate 
                        ? `${edu.startDate} – ${edu.endDate}` 
                        : (edu.graduationDate || '')}
                    </span>
                  </div>

                  <div className={`${fontSizes.subHeading} text-gray-700 font-medium`}>
                    {edu.institution}{edu.city ? `, ${edu.city}` : ''}
                  </div>

                  {edu.description && (
                    <p className="text-gray-700 leading-relaxed whitespace-pre-line pt-1">
                      {edu.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Certifications */}
        {profile.certifications && profile.certifications.data.length > 0 && (
          <section
            onClick={() => onSectionClick?.('certifications')}
            className="mb-6 cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg"
            title="Click to edit Certifications"
          >
            <h2 
              style={{ color: accentColor, borderColor: '#e5e7eb' }} 
              className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-3`}
            >
              Certifications
            </h2>

            <div className="space-y-2">
              {profile.certifications.data.map((cert) => (
                <div key={cert.id} className="flex justify-between items-baseline">
                  <div>
                    <span className="font-bold text-gray-900">{cert.name}</span>
                    {cert.issuer && <span className="text-gray-600"> — {cert.issuer}</span>}
                  </div>
                  {cert.date && <span className={`${fontSizes.meta} text-gray-500 shrink-0 font-medium`}>{cert.date}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Page 1 Boundary Guide Line */}
        <div 
          className="absolute left-0 right-0 border-b border-dashed border-red-300 pointer-events-none select-none opacity-40 no-print flex items-center justify-end pr-4 text-[11px] text-red-500 font-mono"
          style={{ top: '1120px' }}
        >
          <span className="bg-red-50 px-1.5 py-0.5 rounded -translate-y-2">Standard Page 1 Boundary</span>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════
  // 2. MODERN 2-COLUMN SPLIT LAYOUT (High Space Efficiency & Visual Polish)
  // ═════════════════════════════════════════════════════════════════
  if (layoutStyle === 'split') {
    return (
      <div
        className={`w-full min-h-[1140px] bg-white text-gray-900 select-text shadow-sm relative ${fontClass} flex flex-col md:flex-row`}
        style={{ maxWidth: '850px', margin: '0 auto' }}
      >
        {/* Left Column (34% width, tinted sidebar) */}
        <aside className="w-full md:w-[35%] bg-slate-50/90 border-r border-gray-200 p-8 flex flex-col gap-8">
          {/* Contact Details */}
          <div>
            <h3 style={{ color: accentColor }} className="text-xs font-bold uppercase tracking-wider border-b border-gray-200 pb-1.5 mb-3">
              Contact
            </h3>
            <div className="flex flex-col gap-2.5 text-xs text-gray-700">
              {header.location && (
                <span className="flex items-center gap-2">
                  <MapPin size={13} style={{ color: accentColor }} />
                  {header.location}
                </span>
              )}
              {header.email && (
                <span className="flex items-center gap-2">
                  <Mail size={13} style={{ color: accentColor }} />
                  <span className="truncate">{header.email}</span>
                </span>
              )}
              {header.phone && (
                <span className="flex items-center gap-2">
                  <Phone size={13} style={{ color: accentColor }} />
                  {header.phone}
                </span>
              )}
              {header.linkedin && (
                <span className="flex items-center gap-2">
                  <Linkedin size={13} style={{ color: accentColor }} />
                  <span className="truncate">{header.linkedin.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </span>
              )}
              {header.github && (
                <span className="flex items-center gap-2">
                  <Github size={13} style={{ color: accentColor }} />
                  <span className="truncate">{header.github.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </span>
              )}
              {header.portfolio && (
                <span className="flex items-center gap-2">
                  <Globe size={13} style={{ color: accentColor }} />
                  <span className="truncate">{header.portfolio.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </span>
              )}
            </div>
          </div>

          {/* Education in Sidebar */}
          {profile.education.data.length > 0 && (
            <div>
              <h3 style={{ color: accentColor }} className="text-xs font-bold uppercase tracking-wider border-b border-gray-200 pb-1.5 mb-3">
                Education
              </h3>
              <div className="space-y-3 text-xs">
                {profile.education.data.map(edu => (
                  <div key={edu.id} className="space-y-0.5">
                    <p className="font-bold text-gray-900">{edu.degree}</p>
                    <p className="text-gray-700">{edu.institution}</p>
                    <p className="text-[11px] text-gray-500 font-medium">
                      {edu.startDate && edu.endDate ? `${edu.startDate} – ${edu.endDate}` : edu.graduationDate}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills in Sidebar */}
          {profile.skills.data.length > 0 && (
            <div>
              <h3 style={{ color: accentColor }} className="text-xs font-bold uppercase tracking-wider border-b border-gray-200 pb-1.5 mb-3">
                Core Skills
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.data.map(s => (
                  <span key={s.id} className="px-2 py-1 rounded bg-white border border-gray-200 text-xs font-semibold text-gray-800 shadow-2xs">
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Certifications in Sidebar */}
          {profile.certifications && profile.certifications.data.length > 0 && (
            <div>
              <h3 style={{ color: accentColor }} className="text-xs font-bold uppercase tracking-wider border-b border-gray-200 pb-1.5 mb-3">
                Certifications
              </h3>
              <div className="space-y-2 text-xs">
                {profile.certifications.data.map(cert => (
                  <div key={cert.id}>
                    <p className="font-bold text-gray-900">{cert.name}</p>
                    <p className="text-gray-600 text-[11px]">{cert.issuer} {cert.date ? `• ${cert.date}` : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Right Column (66% width, Main Narrative) */}
        <main className="w-full md:w-[65%] p-8 md:p-10 flex flex-col gap-8">
          <div>
            <h1 className={`${fontSizes.name} font-extrabold text-gray-950 tracking-tight`}>
              {fullName}
            </h1>
            {header.desiredJobPosition && (
              <p style={{ color: accentColor }} className="text-base font-semibold tracking-wide mt-1">
                {header.desiredJobPosition}
              </p>
            )}
          </div>

          {/* Profile */}
          {profile.summary.data && (
            <div>
              <h2 style={{ color: accentColor }} className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b border-gray-200 pb-1 mb-2.5`}>
                Profile
              </h2>
              <p className="text-gray-700 leading-relaxed text-justify whitespace-pre-line text-xs">
                {profile.summary.data}
              </p>
            </div>
          )}

          {/* Experience */}
          {profile.experience.data.length > 0 && (
            <div>
              <h2 style={{ color: accentColor }} className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b border-gray-200 pb-1 mb-3`}>
                Work Experience
              </h2>
              <div className="space-y-5">
                {profile.experience.data.map(exp => (
                  <div key={exp.id} className="space-y-1">
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="font-bold text-sm text-gray-900">{exp.roleTitle}</span>
                      <span className="text-[11px] text-gray-500 shrink-0 font-medium">
                        {[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-gray-700">{exp.companyName}{exp.city ? `, ${exp.city}` : ''}</p>
                    {exp.description ? (
                      <p className="text-xs text-gray-700 leading-relaxed pt-1">{exp.description}</p>
                    ) : (
                      <ul className="list-disc list-outside ml-4 space-y-1 pt-1 text-xs text-gray-700">
                        {exp.bullets.filter(b => b.text.trim()).map(b => (
                          <li key={b.id} className="leading-relaxed">{b.text}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {profile.projects.data.length > 0 && (
            <div>
              <h2 style={{ color: accentColor }} className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b border-gray-200 pb-1 mb-3`}>
                Key Projects
              </h2>
              <div className="space-y-4">
                {profile.projects.data.map(proj => (
                  <div key={proj.id} className="space-y-1">
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="font-bold text-sm text-gray-900">{proj.name}</span>
                      {proj.role && <span className="text-xs text-gray-500 font-normal">({proj.role})</span>}
                    </div>
                    <ul className="list-disc list-outside ml-4 space-y-1 pt-0.5 text-xs text-gray-700">
                      {proj.bullets.filter(b => b.text.trim()).map(b => (
                        <li key={b.id} className="leading-relaxed">{b.text}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════
  // 3. MINIMAL LABELED LAYOUT (Reference Screenshot Style)
  // ═════════════════════════════════════════════════════════════════
  return (
    <div
      className={`w-full min-h-[1140px] bg-white text-gray-900 ${spacingStyles.padding} ${fontSizes.body} ${spacingStyles.textLeading} select-text shadow-sm relative ${fontClass}`}
      style={{ maxWidth: '850px', margin: '0 auto' }}
    >
      {/* Centered Resume Title */}
      <div className="text-center mb-9 md:mb-11">
        <h1 
          style={{ color: accentColor }}
          className="text-3xl font-bold tracking-widest uppercase"
        >
          Resume
        </h1>
      </div>

      {/* Personal Details with Key-Value */}
      <section 
        onClick={() => onSectionClick?.('header')}
        className={`${spacingStyles.sectionMargin} cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg`}
        title="Click to edit Personal details"
      >
        <h2 
          style={{ color: accentColor, borderColor: '#e5e7eb' }} 
          className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-4`}
        >
          Personal details
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3.5">
          <div>
            <span className={`${fontSizes.label} font-semibold text-gray-500 block mb-0.5 uppercase tracking-wide`}>Name</span>
            <span className="text-gray-900 font-semibold">{fullName}</span>
          </div>

          {header.email && (
            <div>
              <span className={`${fontSizes.label} font-semibold text-gray-500 block mb-0.5 uppercase tracking-wide`}>Email address</span>
              <span className="text-gray-900">{header.email}</span>
            </div>
          )}

          {header.phone && (
            <div>
              <span className={`${fontSizes.label} font-semibold text-gray-500 block mb-0.5 uppercase tracking-wide`}>Phone number</span>
              <span className="text-gray-900">{header.phone}</span>
            </div>
          )}

          {header.location && (
            <div>
              <span className={`${fontSizes.label} font-semibold text-gray-500 block mb-0.5 uppercase tracking-wide`}>Address / Location</span>
              <span className="text-gray-900">{header.location}</span>
            </div>
          )}

          {header.linkedin && (
            <div>
              <span className={`${fontSizes.label} font-semibold text-gray-500 block mb-0.5 uppercase tracking-wide`}>LinkedIn</span>
              <span className="text-gray-900 truncate block max-w-full font-medium">
                {header.linkedin.replace(/^https?:\/\/(www\.)?/, '')}
              </span>
            </div>
          )}

          {header.github && (
            <div>
              <span className={`${fontSizes.label} font-semibold text-gray-500 block mb-0.5 uppercase tracking-wide`}>GitHub</span>
              <span className="text-gray-900 truncate block max-w-full font-medium">
                {header.github.replace(/^https?:\/\/(www\.)?/, '')}
              </span>
            </div>
          )}

          {header.portfolio && (
            <div>
              <span className={`${fontSizes.label} font-semibold text-gray-500 block mb-0.5 uppercase tracking-wide`}>Website</span>
              <span className="text-gray-900 truncate block max-w-full font-medium">
                {header.portfolio.replace(/^https?:\/\/(www\.)?/, '')}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Profile */}
      {profile.summary.data && (
        <section
          onClick={() => onSectionClick?.('summary')}
          className={`${spacingStyles.sectionMargin} cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg`}
          title="Click to edit Profile"
        >
          <h2 
            style={{ color: accentColor, borderColor: '#e5e7eb' }} 
            className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-3`}
          >
            Profile
          </h2>
          <p className="text-gray-700 leading-relaxed text-justify whitespace-pre-line mt-2">
            {profile.summary.data}
          </p>
        </section>
      )}

      {/* Education */}
      {profile.education.data.length > 0 && (
        <section
          onClick={() => onSectionClick?.('education')}
          className={`${spacingStyles.sectionMargin} cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg`}
          title="Click to edit Education"
        >
          <h2 
            style={{ color: accentColor, borderColor: '#e5e7eb' }} 
            className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-4`}
          >
            Education
          </h2>

          <div className={spacingStyles.itemGap}>
            {profile.education.data.map((edu) => (
              <div key={edu.id} className="space-y-1">
                <div className="flex justify-between items-baseline gap-4">
                  <span className={`${fontSizes.itemHeading} font-bold text-gray-900`}>
                    {edu.degree || 'Degree'}
                  </span>
                  <span className={`${fontSizes.meta} text-gray-500 shrink-0 font-medium`}>
                    {edu.startDate && edu.endDate 
                      ? `${edu.startDate} – ${edu.endDate}` 
                      : (edu.graduationDate || '')}
                  </span>
                </div>

                <div className={`${fontSizes.subHeading} text-gray-700 font-medium`}>
                  {edu.institution}{edu.city ? `, ${edu.city}` : ''}
                </div>

                {edu.description && (
                  <p className="text-gray-700 leading-relaxed whitespace-pre-line pt-1">
                    {edu.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Experience */}
      {profile.experience.data.length > 0 && (
        <section
          onClick={() => onSectionClick?.('experience')}
          className={`${spacingStyles.sectionMargin} cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg`}
          title="Click to edit Employment"
        >
          <h2 
            style={{ color: accentColor, borderColor: '#e5e7eb' }} 
            className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-4`}
          >
            Employment
          </h2>

          <div className={spacingStyles.itemGap}>
            {profile.experience.data.map((exp) => (
              <div key={exp.id} className="space-y-1.5">
                <div className="flex justify-between items-baseline gap-4">
                  <span className={`${fontSizes.itemHeading} font-bold text-gray-900`}>
                    {exp.roleTitle || 'Position'}
                  </span>
                  <span className={`${fontSizes.meta} text-gray-500 shrink-0 font-medium`}>
                    {[exp.startDate, exp.endDate].filter(Boolean).join(' – ')}
                  </span>
                </div>

                <div className={`${fontSizes.subHeading} text-gray-700 font-medium`}>
                  {exp.companyName}{exp.city ? `, ${exp.city}` : ''}
                </div>

                {exp.description ? (
                  <p className="text-gray-700 leading-relaxed whitespace-pre-line pt-1">
                    {exp.description}
                  </p>
                ) : (
                  <ul className={`list-disc list-outside ml-5 ${spacingStyles.bulletGap} pt-1.5 text-gray-700`}>
                    {exp.bullets.filter(b => b.text.trim()).map((b) => (
                      <li key={b.id} className="leading-relaxed pl-1">
                        {b.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Skills */}
      {(techSkills.length > 0 || toolSkills.length > 0 || softSkills.length > 0 || langSkills.length > 0) && (
        <section
          onClick={() => onSectionClick?.('skills')}
          className={`${spacingStyles.sectionMargin} cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg`}
          title="Click to edit Skills"
        >
          <h2 
            style={{ color: accentColor, borderColor: '#e5e7eb' }} 
            className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-4`}
          >
            Skills
          </h2>

          <div className="space-y-2.5">
            {techSkills.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="font-bold text-gray-900 w-32 shrink-0">Technical:</span>
                <span className="text-gray-700 leading-relaxed">{techSkills.map(s => s.name).join(', ')}</span>
              </div>
            )}
            {toolSkills.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="font-bold text-gray-900 w-32 shrink-0">Tools:</span>
                <span className="text-gray-700 leading-relaxed">{toolSkills.map(s => s.name).join(', ')}</span>
              </div>
            )}
            {softSkills.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="font-bold text-gray-900 w-32 shrink-0">Soft Skills:</span>
                <span className="text-gray-700 leading-relaxed">{softSkills.map(s => s.name).join(', ')}</span>
              </div>
            )}
            {langSkills.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:gap-4">
                <span className="font-bold text-gray-900 w-32 shrink-0">Languages:</span>
                <span className="text-gray-700 leading-relaxed">{langSkills.map(s => s.name).join(', ')}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Projects */}
      {profile.projects.data.length > 0 && (
        <section
          onClick={() => onSectionClick?.('projects')}
          className={`${spacingStyles.sectionMargin} cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg`}
          title="Click to edit Projects"
        >
          <h2 
            style={{ color: accentColor, borderColor: '#e5e7eb' }} 
            className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-4`}
          >
            Projects
          </h2>

          <div className={spacingStyles.itemGap}>
            {profile.projects.data.map((proj) => (
              <div key={proj.id} className="space-y-1.5">
                <div className="flex justify-between items-baseline gap-4">
                  <div className="flex items-center gap-2">
                    <span className={`${fontSizes.itemHeading} font-bold text-gray-900`}>{proj.name}</span>
                    {proj.role && <span className={`${fontSizes.meta} text-gray-500 font-normal`}>({proj.role})</span>}
                  </div>
                  {proj.url && (
                    <span className={`${fontSizes.meta} text-primary-600 font-medium truncate max-w-[220px]`}>
                      {proj.url.replace(/^https?:\/\/(www\.)?/, '')}
                    </span>
                  )}
                </div>

                <ul className={`list-disc list-outside ml-5 ${spacingStyles.bulletGap} pt-1 text-gray-700`}>
                  {proj.bullets.filter(b => b.text.trim()).map((b) => (
                    <li key={b.id} className="leading-relaxed pl-1">
                      {b.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Certifications */}
      {profile.certifications && profile.certifications.data.length > 0 && (
        <section
          onClick={() => onSectionClick?.('certifications')}
          className="mb-6 cursor-pointer group transition-colors hover:bg-slate-50/70 p-2 -m-2 rounded-lg"
          title="Click to edit Certifications"
        >
          <h2 
            style={{ color: accentColor, borderColor: '#e5e7eb' }} 
            className={`${fontSizes.sectionHeading} font-bold uppercase tracking-wider border-b pb-1.5 mb-3`}
          >
            Certifications
          </h2>

          <div className="space-y-2">
            {profile.certifications.data.map((cert) => (
              <div key={cert.id} className="flex justify-between items-baseline">
                <div>
                  <span className="font-bold text-gray-900">{cert.name}</span>
                  {cert.issuer && <span className="text-gray-600"> — {cert.issuer}</span>}
                </div>
                {cert.date && <span className={`${fontSizes.meta} text-gray-500 shrink-0 font-medium`}>{cert.date}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
