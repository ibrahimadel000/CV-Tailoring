import { useId, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useAppStore } from '@/store/useAppStore';
import type { BulletPoint, CVProfile, ResumeHeader, SkillTag } from '@/types/schema';
import type { BuiltInSectionId } from './resumeModel';
import { PageLayoutControls } from './PageLayoutControls';
import { Field, DateRangeFields, FormSection, GrowingTextarea, OptionalAreaField, EntryCard, EntryGroup } from './EditorControls';

function BulletEditor({ bullets, onChange }: { bullets: BulletPoint[]; onChange: (v: BulletPoint[]) => void }) {
  const id = useId(); const root = useRef<HTMLDivElement>(null);
  const add = () => {
    onChange([...bullets, { id: uuid(), text: '', isVerified: false }]);
    requestAnimationFrame(() => root.current?.querySelector<HTMLTextAreaElement>('.bullet-row:last-of-type textarea')?.focus());
  };
  return <div ref={root} className="bullet-editor" role="group" aria-labelledby={`${id}-label`}><h4 id={`${id}-label`}>Achievements</h4><p id={`${id}-help`}>One achievement per bullet. Focus on your contribution and impact.</p>{bullets.map((b, i) => <div key={b.id} className="bullet-row"><span aria-hidden="true">•</span><GrowingTextarea aria-label={`Achievement ${i + 1}`} aria-describedby={`${id}-help`} rows={2} value={b.text} onChange={e => onChange(bullets.map(x => x.id === b.id ? { ...x, text: e.target.value, isVerified: false } : x))} placeholder="Describe your contribution and its impact" /><button className="icon-button" aria-label={`Remove achievement ${i + 1}`} onClick={() => { onChange(bullets.filter(x => x.id !== b.id)); requestAnimationFrame(() => { const remaining = root.current?.querySelectorAll<HTMLTextAreaElement>('textarea'); if (remaining?.length) remaining[Math.min(i, remaining.length - 1)].focus(); else root.current?.querySelector<HTMLButtonElement>('.text-button')?.focus(); }); }}><X size={16} /></button></div>)}<button className="text-button" onClick={add}><Plus size={16} /> Add achievement</button></div>;
}
export function SectionEditor({ section, profile }: { section: BuiltInSectionId; profile: CVProfile }) {
  const s = useAppStore();
  const h = profile.resumeHeader.data;
  const form = useRef<HTMLFieldSetElement>(null);
  const [addedLinks, setAddedLinks] = useState<string[]>([]);
  const linkFields = [
    { key: 'linkedin', flag: 'showLinkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/your-name' },
    { key: 'portfolio', flag: 'showPortfolio', label: 'Website', placeholder: 'your-website.com' },
    { key: 'github', flag: 'showGithub', label: 'GitHub', placeholder: 'github.com/your-name' },
    { key: 'suffixName', flag: 'showSuffixName', label: 'Name suffix', placeholder: 'e.g. PhD' },
    { key: 'otherUrl', flag: 'showOtherUrl', label: 'Other link', placeholder: 'Professional link' },
  ] as const;
  const addLink = (key: string) => {
    setAddedLinks(xs => [...xs, key]);
    requestAnimationFrame(() => form.current?.querySelector<HTMLInputElement>(`[data-link-field="${key}"] input:not([type="checkbox"])`)?.focus());
  };
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
  return <EntryGroup><fieldset ref={form} className="section-fieldset" disabled={locked}>
    {locked && <p className="locked-notice">This section is locked in your existing profile.</p>}
    {section === 'personal' && <>
      <FormSection>
        <div className="form-grid name-grid"><Field label="First name" value={h.firstName ?? h.name.split(' ')[0]} autoComplete="given-name" placeholder="e.g. Alex" onChange={v => updateHeader({ firstName: v, name: `${v} ${h.lastName ?? h.name.split(' ').slice(1).join(' ')}`.trim() })} /><Field label="Last name" value={h.lastName ?? h.name.split(' ').slice(1).join(' ')} autoComplete="family-name" placeholder="e.g. Morgan" onChange={v => updateHeader({ lastName: v, name: `${h.firstName ?? h.name.split(' ')[0]} ${v}`.trim() })} /></div>
        <Field visibility={{ label: 'Show professional title', text: 'Use as headline', checked: h.useAsHeadline !== false, onChange: v => updateHeader({ useAsHeadline: v }) }} label="Professional title" value={h.desiredJobPosition ?? profile.headline.data} autoComplete="organization-title" placeholder="e.g. Product Designer" onChange={v => updateHeader({ desiredJobPosition: v })} />
      </FormSection>
      <FormSection title="Contact information">
        <div className="form-grid contact-grid"><Field label="Email address" type="email" autoComplete="email" value={h.email} placeholder="alex@example.com" onChange={v => updateHeader({ email: v })} error={h.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h.email) ? 'Enter an email address like name@example.com.' : undefined} /><Field visibility={{ label: 'Show phone', checked: h.showPhone !== false, onChange: v => updateHeader({ showPhone: v }) }} label="Phone number" type="tel" autoComplete="tel" value={h.phone} placeholder="+1 555 012 3456" onChange={v => updateHeader({ phone: v })} /></div>
        <Field visibility={{ label: 'Show location', checked: h.showLocation !== false, onChange: v => updateHeader({ showLocation: v }) }} label="Location" autoComplete="address-level2" value={h.location} placeholder="City, Country" onChange={v => updateHeader({ location: v })} />
      </FormSection>
      <FormSection title="Links & extra details">
        {linkFields.filter(f => Boolean(h[f.key]) || addedLinks.includes(f.key)).map(f => <div key={f.key} data-link-field={f.key} className="optional-link-field"><Field label={f.label} value={h[f.key]} autoComplete={f.key === 'suffixName' ? 'honorific-suffix' : 'off'} placeholder={f.placeholder} onChange={v => updateHeader({ [f.key]: v })} visibility={{ label: `Show ${f.label}`, checked: h[f.flag] !== false, onChange: v => updateHeader({ [f.flag]: v }) }} /></div>)}
        {linkFields.some(f => !h[f.key] && !addedLinks.includes(f.key)) && <div className="add-detail-group"><span>Add only the details you need.</span><div className="section-suggestions">{linkFields.filter(f => !h[f.key] && !addedLinks.includes(f.key)).map(f => <button key={f.key} className="section-chip" onClick={() => addLink(f.key)}><Plus size={15} />{f.label}</button>)}</div></div>}
      </FormSection>
    </>}
    {section === 'summary' && <><Field label="Your professional summary" value={profile.summary.data} onChange={s.updateSummary} area placeholder="Introduce your background, strengths, and the kind of work you do…" hint="Plain text works best. Only describe experience and skills you actually have." /><div className="word-count">{profile.summary.data.trim().split(/\s+/).filter(Boolean).length} words</div></>}
    {section === 'experience' && <>
      {profile.experience.data.map((e, i) => <EntryCard key={e.id} startOpen={!e.roleTitle && !e.companyName} title={e.roleTitle || 'Untitled role'} layoutNote={profile.pageLayout?.entries?.[e.id] === 'new-page' ? 'Manual page break' : profile.pageLayout?.entries?.[e.id] === 'together' ? 'Keep together' : undefined} subtitle={e.companyName} onRemove={() => s.removeExperience(e.id)} {...orderProps('experience', i)}><Field label="Job title" value={e.roleTitle} onChange={v => s.updateExperience(e.id, { roleTitle: v })} placeholder="e.g. Frontend Developer" /><Field label="Company" value={e.companyName} onChange={v => s.updateExperience(e.id, { companyName: v })} /><Field label="Location" value={e.city} onChange={v => s.updateExperience(e.id, { city: v })} /><FormSection title="Employment dates"><DateRangeFields start={e.startDate} end={e.endDate} onStart={v => s.updateExperience(e.id, { startDate: v })} onEnd={v => s.updateExperience(e.id, { endDate: v })} currentLabel="I currently work here" /></FormSection><FormSection title="Role highlights"><OptionalAreaField label="Role overview (optional)" addLabel="Add role overview" value={e.description} onChange={v => s.updateExperience(e.id, { description: v })} /><BulletEditor bullets={e.bullets} onChange={v => s.updateExperience(e.id, { bullets: v })} /></FormSection><PageLayoutControls profile={profile} section="experience" entryId={e.id} /></EntryCard>)}
      <AddEntry title="Add work experience" empty={!profile.experience.data.length} description="Your roles, responsibilities, and the impact you made." onClick={s.addExperience} />
    </>}
    {section === 'education' && <>
      {profile.education.data.map((e, i) => <EntryCard key={e.id} startOpen={!e.degree && !e.institution} title={e.degree || 'Untitled qualification'} subtitle={e.institution} onRemove={() => s.removeEducation(e.id)} {...orderProps('education', i)}><Field label="Degree / qualification" value={e.degree} onChange={v => s.updateEducation(e.id, { degree: v })} placeholder="e.g. BSc Computer Science" /><Field label="School / university" value={e.institution} onChange={v => s.updateEducation(e.id, { institution: v })} /><Field label="Location" value={e.city} onChange={v => s.updateEducation(e.id, { city: v })} /><div className="form-grid"><Field label="Start date" value={e.startDate} onChange={v => s.updateEducation(e.id, { startDate: v })} placeholder="Sep 2020" /><Field label="End / graduation date" value={e.endDate || e.graduationDate} onChange={v => s.updateEducation(e.id, { endDate: v, graduationDate: v })} placeholder="Jun 2024" /></div><Field label="GPA (optional)" value={e.gpa} onChange={v => s.updateEducation(e.id, { gpa: v })} /><Field label="Honors (one per line)" value={e.honors?.join('\n')} onChange={v => s.updateEducation(e.id, { honors: v.split('\n') })} area /><Field label="Relevant coursework / details" value={e.description} onChange={v => s.updateEducation(e.id, { description: v })} area /></EntryCard>)}
      <AddEntry title="Add education" empty={!profile.education.data.length} description="Include your degree, school, or a relevant qualification." onClick={s.addEducation} />
    </>}
    {section === 'skills' && <><div className="skill-add"><Field label="Add your skills" value={skillText} onChange={setSkillText} onEnter={addSkills} placeholder="React, TypeScript, Figma" /><label className="builder-field"><span>Category</span><select value={category} onChange={e => setCategory(e.target.value as SkillTag['category'])}>{['Technical', 'Tools', 'Soft', 'Languages'].map(c => <option key={c}>{c}</option>)}</select></label><button className="primary-button" disabled={!skillText.trim()} onClick={addSkills}><Plus size={16} /> Add skills</button></div>{(['Technical', 'Tools', 'Soft', 'Languages'] as SkillTag['category'][]).map(c => {
      const items = profile.skills.data.filter(x => x.category === c);
      return items.length ? <div className="skill-category" key={c}><h3>{c === 'Soft' ? 'Interpersonal' : c} <span>{items.length}</span></h3><div className="skill-tags">{items.map(x => <span key={x.id}>{x.name}<button onClick={() => s.removeSkill(x.id)} aria-label={`Remove skill ${x.name}`}><X size={14} /></button></span>)}</div></div> : null;
    })}{!profile.skills.data.length && <p className="subtle-note">Your skills will appear here as you add them.</p>}</>}
    {section === 'projects' && <>
      {profile.projects.data.map((e, i) => <EntryCard key={e.id} startOpen={!e.name} title={e.name || 'Untitled project'} subtitle={e.role} onRemove={() => s.removeProject(e.id)} {...orderProps('projects', i)}><Field label="Project name" value={e.name} onChange={v => s.updateProject(e.id, { name: v })} /><Field label="Your role (optional)" value={e.role} onChange={v => s.updateProject(e.id, { role: v })} /><Field label="Project link (optional)" value={e.url} onChange={v => s.updateProject(e.id, { url: v })} /><BulletEditor bullets={e.bullets} onChange={v => s.updateProject(e.id, { bullets: v })} /></EntryCard>)}
      <AddEntry title="Add a project" empty={!profile.projects.data.length} description="Show a meaningful example of what you can do." onClick={s.addProject} />
    </>}
    {section === 'certifications' && <>
      {profile.certifications.data.map((e, i) => <EntryCard key={e.id} startOpen={!e.name} title={e.name || 'Untitled certification'} subtitle={e.issuer} onRemove={() => s.removeCertification(e.id)} {...orderProps('certifications', i)}><Field label="Certification name" value={e.name} onChange={v => s.updateCertification(e.id, { name: v })} /><Field label="Issuing organization" value={e.issuer} onChange={v => s.updateCertification(e.id, { issuer: v })} /><Field label="Date / validity" value={e.date} onChange={v => s.updateCertification(e.id, { date: v })} placeholder="2025 – 2028" /></EntryCard>)}
      <AddEntry title="Add a certification" empty={!profile.certifications.data.length} description="Professional credentials, licenses, or qualifications." onClick={s.addCertification} />
    </>}
  </fieldset></EntryGroup>;
}
function AddEntry({ title, empty, description, onClick }: { title: string; empty: boolean; description: string; onClick: () => void }) {
  return <div className={empty ? 'add-entry empty-entry' : 'add-entry'}>{empty && <p>{description}</p>}<button className="secondary-button" onClick={onClick}><Plus size={17} />{title}</button></div>;
}
