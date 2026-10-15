import { useId, useState, type ReactNode } from 'react';
import { Plus, Trash2, ChevronDown, ArrowUp, ArrowDown, X } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useAppStore } from '@/store/useAppStore';
import type { BulletPoint, CVProfile, ResumeHeader, SkillTag } from '@/types/schema';
import type { BuiltInSectionId } from './resumeModel';

function Field({ label, value, onChange, placeholder, type = 'text', area = false, hint }: { label: string; value?: string; onChange: (value: string) => void; placeholder?: string; type?: string; area?: boolean; hint?: string }) {
  const id = useId();
  return <div className="builder-field"><label htmlFor={id}>{label}</label>{area ? <textarea id={id} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={5} /> : <input id={id} type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}{hint && <small>{hint}</small>}</div>;
}
function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="check-field"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span>{label}</span></label>;
}
function EntryCard({ title, subtitle, children, onRemove, onUp, onDown }: { title: string; subtitle?: string; children: ReactNode; onRemove: () => void; onUp?: () => void; onDown?: () => void }) {
  const [open, setOpen] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const id = useId();
  return <div className="entry-card"><div className="entry-heading"><button className="entry-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}><span><strong>{title}</strong><small>{subtitle || 'Complete the details below'}</small></span><ChevronDown size={17} style={{ transform: open ? 'rotate(180deg)' : '' }} /></button><div className="entry-actions"><button className="icon-button" aria-label={`Move ${title} up`} onClick={onUp} disabled={!onUp}><ArrowUp size={15} /></button><button className="icon-button" aria-label={`Move ${title} down`} onClick={onDown} disabled={!onDown}><ArrowDown size={15} /></button><button className="icon-button danger-text" aria-label={`Remove ${title}`} onClick={() => setConfirm(!confirm)}><Trash2 size={15} /></button></div></div>{confirm && <div className="inline-confirm"><span>Remove this entry?</span><button className="text-button danger-text" onClick={onRemove}>Remove</button><button className="text-button" onClick={() => setConfirm(false)}>Keep</button></div>}{open && <div id={id} className="entry-form">{children}</div>}</div>;
}
function BulletEditor({ bullets, onChange }: { bullets: BulletPoint[]; onChange: (v: BulletPoint[]) => void }) {
  return <div className="bullet-editor"><label>Achievements</label><p>One achievement per bullet. Keep it specific and truthful.</p>{bullets.map((b, i) => <div key={b.id} className="bullet-row"><span>•</span><textarea aria-label={`Achievement ${i + 1}`} rows={2} value={b.text} onChange={e => onChange(bullets.map(x => x.id === b.id ? { ...x, text: e.target.value, isVerified: false } : x))} placeholder="Describe your contribution and its impact" /><button className="icon-button" aria-label={`Remove achievement ${i + 1}`} onClick={() => onChange(bullets.filter(x => x.id !== b.id))}><X size={15} /></button></div>)}<button className="text-button" onClick={() => onChange([...bullets, { id: uuid(), text: '', isVerified: false }])}><Plus size={15} /> Add achievement</button></div>;
}
export function SectionEditor({ section, profile }: { section: BuiltInSectionId; profile: CVProfile }) {
  const s = useAppStore();
  const h = profile.resumeHeader.data;
  const [skillText, setSkillText] = useState('');
  const [category, setCategory] = useState<SkillTag['category']>('Technical');
  const locked = section === 'personal' ? profile.resumeHeader.isLocked : profile[section].isLocked;
  const updateHeader = (values: Partial<ResumeHeader>) => s.updateResumeHeader(values);
  const reorder = (key: 'experience' | 'education' | 'projects' | 'certifications', index: number, direction: number) => {
    useAppStore.setState(state => ({ profiles: state.profiles.map(p => {
      if (p.profileId !== profile.profileId) return p;
      const data = [...p[key].data];
      [data[index], data[index + direction]] = [data[index + direction], data[index]];
      return { ...p, [key]: { ...p[key], data } } as CVProfile;
    }) }));
  };
  const orderProps = (key: 'experience' | 'education' | 'projects' | 'certifications', i: number) => ({ onUp: i > 0 ? () => reorder(key, i, -1) : undefined, onDown: i < profile[key].data.length - 1 ? () => reorder(key, i, 1) : undefined });
  const addSkills = () => {
    const names = [...new Set(skillText.split(',').map(t => t.trim()).filter(Boolean))];
    if (!names.length) return;
    useAppStore.setState(state => ({ profiles: state.profiles.map(p => p.profileId === profile.profileId ? { ...p, skills: { ...p.skills, data: [...p.skills.data, ...names.filter(name => !p.skills.data.some(x => x.name.toLowerCase() === name.toLowerCase() && x.category === category)).map(name => ({ id: uuid(), name, category }))] } } : p) }));
    setSkillText('');
  };
  return <fieldset className="section-fieldset" disabled={locked}>
    {locked && <p className="locked-notice">This section is locked in your existing profile.</p>}
    {section === 'personal' && <>
      <div className="form-group-title">The introduction</div>
      <div className="form-grid"><Field label="First name" value={h.firstName ?? h.name.split(' ')[0]} placeholder="e.g. Alex" onChange={v => updateHeader({ firstName: v, name: `${v} ${h.lastName ?? h.name.split(' ').slice(1).join(' ')}`.trim() })} /><Field label="Last name" value={h.lastName ?? h.name.split(' ').slice(1).join(' ')} placeholder="e.g. Morgan" onChange={v => updateHeader({ lastName: v, name: `${h.firstName ?? h.name.split(' ')[0]} ${v}`.trim() })} /></div>
      <Field label="Professional title" value={h.desiredJobPosition} placeholder="e.g. Product Designer" onChange={v => updateHeader({ desiredJobPosition: v })} />
      <CheckField label="Show professional title on my resume" checked={h.useAsHeadline !== false} onChange={v => updateHeader({ useAsHeadline: v })} />
      <div className="form-group-title">Contact information</div>
      <Field label="Email address" type="email" value={h.email} placeholder="alex@example.com" onChange={v => updateHeader({ email: v })} />
      {h.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h.email) && <p className="field-error">Check the format of your email address.</p>}
      <div className="form-grid"><Field label="Phone number" type="tel" value={h.phone} placeholder="+1 555 012 3456" onChange={v => updateHeader({ phone: v })} /><Field label="Location" value={h.location} placeholder="City, Country" onChange={v => updateHeader({ location: v })} /></div>
      <div className="form-checks"><CheckField label="Show phone" checked={h.showPhone !== false} onChange={v => updateHeader({ showPhone: v })} /><CheckField label="Show location" checked={h.showLocation !== false} onChange={v => updateHeader({ showLocation: v })} /></div>
      <div className="form-group-title">Professional links <span>Optional</span></div>
      <Field label="LinkedIn" value={h.linkedin} placeholder="linkedin.com/in/your-name" onChange={v => updateHeader({ linkedin: v })} />
      <Field label="Portfolio / website" value={h.portfolio} placeholder="your-website.com" onChange={v => updateHeader({ portfolio: v })} />
      <Field label="GitHub" value={h.github} placeholder="github.com/your-name" onChange={v => updateHeader({ github: v })} />
      <div className="form-checks"><CheckField label="Show LinkedIn" checked={h.showLinkedin !== false} onChange={v => updateHeader({ showLinkedin: v })} /><CheckField label="Show website" checked={h.showPortfolio !== false} onChange={v => updateHeader({ showPortfolio: v })} /><CheckField label="Show GitHub" checked={h.showGithub !== false} onChange={v => updateHeader({ showGithub: v })} /></div>
      <details className="optional-details"><summary>Additional details</summary><Field label="Name suffix" value={h.suffixName} onChange={v => updateHeader({ suffixName: v })} /><CheckField label="Show name suffix" checked={h.showSuffixName !== false} onChange={v => updateHeader({ showSuffixName: v })} /><Field label="Other professional link" value={h.otherUrl} onChange={v => updateHeader({ otherUrl: v })} /><CheckField label="Show other link" checked={h.showOtherUrl !== false} onChange={v => updateHeader({ showOtherUrl: v })} /><p>Photos are not included in these text-first templates.</p></details>
    </>}
    {section === 'summary' && <><Field label="Your professional summary" value={profile.summary.data} onChange={s.updateSummary} area placeholder="Introduce your background, strengths, and the kind of work you do…" hint="Plain text works best. Only describe experience and skills you actually have." /><div className="word-count">{profile.summary.data.trim().split(/\s+/).filter(Boolean).length} words</div></>}
    {section === 'experience' && <>
      {profile.experience.data.map((e, i) => <EntryCard key={e.id} title={e.roleTitle || 'Untitled role'} subtitle={e.companyName} onRemove={() => s.removeExperience(e.id)} {...orderProps('experience', i)}><Field label="Job title" value={e.roleTitle} onChange={v => s.updateExperience(e.id, { roleTitle: v })} placeholder="e.g. Frontend Developer" /><Field label="Company" value={e.companyName} onChange={v => s.updateExperience(e.id, { companyName: v })} /><Field label="Location" value={e.city} onChange={v => s.updateExperience(e.id, { city: v })} /><div className="form-grid"><Field label="Start date" value={e.startDate} onChange={v => s.updateExperience(e.id, { startDate: v })} placeholder="Jan 2023" /><Field label="End date" value={e.endDate} onChange={v => s.updateExperience(e.id, { endDate: v })} placeholder="Present" /></div><CheckField label="I currently work here" checked={e.endDate === 'Present'} onChange={v => s.updateExperience(e.id, { endDate: v ? 'Present' : '' })} /><Field label="Role overview (optional)" value={e.description} onChange={v => s.updateExperience(e.id, { description: v })} area /><BulletEditor bullets={e.bullets} onChange={v => s.updateExperience(e.id, { bullets: v })} /></EntryCard>)}
      <AddEntry title="Add work experience" empty={!profile.experience.data.length} description="Your roles, responsibilities, and the impact you made." onClick={s.addExperience} />
    </>}
    {section === 'education' && <>
      {profile.education.data.map((e, i) => <EntryCard key={e.id} title={e.degree || 'Untitled qualification'} subtitle={e.institution} onRemove={() => s.removeEducation(e.id)} {...orderProps('education', i)}><Field label="Degree / qualification" value={e.degree} onChange={v => s.updateEducation(e.id, { degree: v })} placeholder="e.g. BSc Computer Science" /><Field label="School / university" value={e.institution} onChange={v => s.updateEducation(e.id, { institution: v })} /><Field label="Location" value={e.city} onChange={v => s.updateEducation(e.id, { city: v })} /><div className="form-grid"><Field label="Start date" value={e.startDate} onChange={v => s.updateEducation(e.id, { startDate: v })} placeholder="Sep 2020" /><Field label="End / graduation date" value={e.endDate || e.graduationDate} onChange={v => s.updateEducation(e.id, { endDate: v, graduationDate: v })} placeholder="Jun 2024" /></div><Field label="GPA (optional)" value={e.gpa} onChange={v => s.updateEducation(e.id, { gpa: v })} /><Field label="Honors (one per line)" value={e.honors?.join('\n')} onChange={v => s.updateEducation(e.id, { honors: v.split('\n') })} area /><Field label="Relevant coursework / details" value={e.description} onChange={v => s.updateEducation(e.id, { description: v })} area /></EntryCard>)}
      <AddEntry title="Add education" empty={!profile.education.data.length} description="Include your degree, school, or a relevant qualification." onClick={s.addEducation} />
    </>}
    {section === 'skills' && <><div className="skill-add"><Field label="Add your skills" value={skillText} onChange={setSkillText} placeholder="React, TypeScript, Figma" /><label className="builder-field"><span>Category</span><select value={category} onChange={e => setCategory(e.target.value as SkillTag['category'])}>{['Technical', 'Tools', 'Soft', 'Languages'].map(c => <option key={c}>{c}</option>)}</select></label><button className="primary-button" disabled={!skillText.trim()} onClick={addSkills}><Plus size={16} /> Add skills</button></div>{(['Technical', 'Tools', 'Soft', 'Languages'] as SkillTag['category'][]).map(c => {
      const items = profile.skills.data.filter(x => x.category === c);
      return items.length ? <div className="skill-category" key={c}><h3>{c === 'Soft' ? 'Interpersonal' : c} <span>{items.length}</span></h3><div className="skill-tags">{items.map(x => <span key={x.id}>{x.name}<button onClick={() => s.removeSkill(x.id)} aria-label={`Remove skill ${x.name}`}><X size={14} /></button></span>)}</div></div> : null;
    })}{!profile.skills.data.length && <p className="subtle-note">Your skills will appear here as you add them.</p>}</>}
    {section === 'projects' && <>
      {profile.projects.data.map((e, i) => <EntryCard key={e.id} title={e.name || 'Untitled project'} subtitle={e.role} onRemove={() => s.removeProject(e.id)} {...orderProps('projects', i)}><Field label="Project name" value={e.name} onChange={v => s.updateProject(e.id, { name: v })} /><Field label="Your role (optional)" value={e.role} onChange={v => s.updateProject(e.id, { role: v })} /><Field label="Project link (optional)" value={e.url} onChange={v => s.updateProject(e.id, { url: v })} /><BulletEditor bullets={e.bullets} onChange={v => s.updateProject(e.id, { bullets: v })} /></EntryCard>)}
      <AddEntry title="Add a project" empty={!profile.projects.data.length} description="Show a meaningful example of what you can do." onClick={s.addProject} />
    </>}
    {section === 'certifications' && <>
      {profile.certifications.data.map((e, i) => <EntryCard key={e.id} title={e.name || 'Untitled certification'} subtitle={e.issuer} onRemove={() => s.removeCertification(e.id)} {...orderProps('certifications', i)}><Field label="Certification name" value={e.name} onChange={v => s.updateCertification(e.id, { name: v })} /><Field label="Issuing organization" value={e.issuer} onChange={v => s.updateCertification(e.id, { issuer: v })} /><Field label="Date / validity" value={e.date} onChange={v => s.updateCertification(e.id, { date: v })} placeholder="2025 – 2028" /></EntryCard>)}
      <AddEntry title="Add a certification" empty={!profile.certifications.data.length} description="Professional credentials, licenses, or qualifications." onClick={s.addCertification} />
    </>}
  </fieldset>;
}
function AddEntry({ title, empty, description, onClick }: { title: string; empty: boolean; description: string; onClick: () => void }) {
  return <div className={empty ? 'add-entry empty-entry' : 'add-entry'}>{empty && <><span className="empty-plus"><Plus size={24} /></span><h3>A space for your story</h3><p>{description}</p></>}<button className={empty ? 'primary-button' : 'secondary-button'} onClick={onClick}><Plus size={17} />{title}</button></div>;
}
