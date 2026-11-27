import { useEffect, useState } from 'react';
import { Check, ShieldCheck, Sparkles } from 'lucide-react';
import { autoOptimizeTheme } from '@/services/autoLayout';
import { useAppStore } from '@/store/useAppStore';
import { getTemplateMeta, RESUME_TEMPLATES } from './templates';

type TemplateFilter = 'all' | 'balanced' | 'editorial' | 'compact';

export function DesignPanel() {
  const theme = useAppStore(s => s.documentTheme);
  const rawUpdate = useAppStore(s => s.setDocumentTheme);
  const activeProfileId = useAppStore(s => s.activeProfileId);
  const [filter, setFilter] = useState<TemplateFilter>('all');
  const [fitNote, setFitNote] = useState('');

  useEffect(() => {
    setFitNote('');
  }, [activeProfileId]);

  const update = (patch: Partial<typeof theme>) => {
    setFitNote('');
    rawUpdate(patch);
  };

  const runAutoFormat = () => {
    const state = useAppStore.getState();
    const active = state.profiles.find(p => p.profileId === state.activeProfileId);
    if (!active) return;
    const result = autoOptimizeTheme(active, state.documentTheme, { rollbackIfStillOver: true, allowExpand: true });
    if (result.changed) {
      rawUpdate(result.theme);
      if (result.mode === 'expand') {
        setFitNote('Expanded margins and spacing for a balanced single page.');
      } else {
        const target = result.targetPages ?? 1;
        setFitNote(
          result.estimatedPagesAfter <= target
            ? `Fitted cleanly onto ${target} ${target === 1 ? 'page' : 'pages'}.`
            : 'Optimized layout while keeping spacing readable.',
        );
      }
    } else if (result.rolledBack) {
      setFitNote('Too much content to tighten further — kept your current spacing readable.');
    } else {
      setFitNote('Your resume already has a balanced layout.');
    }
  };

  const activeTemplate = getTemplateMeta(theme.layoutStyle);
  const visibleTemplates = filter === 'all'
    ? RESUME_TEMPLATES
    : RESUME_TEMPLATES.filter(t => t.density === filter);
  const activeHiddenByFilter = !visibleTemplates.some(t => t.id === activeTemplate.id);
  const normalMarginLabel = theme.layoutStyle === 'minimal' || theme.layoutStyle === 'technical' ? 'Balanced · 36 pt' : theme.layoutStyle === 'executive' ? 'Balanced · 44 pt' : 'Balanced · 42 pt';

  return <div className="design-panel"><p className="design-intro">Choose a layout and fine-tune the details. Your preview updates as you work.</p>
    <div className="template-header-row">
      <h3 className="design-label">Choose a template</h3>
      <div className="template-filter-chips" role="group" aria-label="Filter templates">
        {([
          { id: 'all', label: 'All' },
          { id: 'balanced', label: 'Modern' },
          { id: 'editorial', label: 'Classic' },
          { id: 'compact', label: 'Compact' },
        ] as const).map(chip => (
          <button
            key={chip.id}
            type="button"
            className={`template-filter-chip ${filter === chip.id ? 'active' : ''}`}
            aria-pressed={filter === chip.id}
            onClick={() => setFilter(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
    {activeHiddenByFilter && <p className="subtle-note">Current template: <strong>{activeTemplate.name}</strong></p>}
    <div className="template-list">{visibleTemplates.map(t => <button key={t.id} className={`template-card ${activeTemplate.id === t.id ? 'selected' : ''}`} aria-pressed={activeTemplate.id === t.id} onClick={() => update({ layoutStyle: t.id, fontFamily: t.font })}><span className={`mini-resume mini-${t.id}`} aria-hidden="true"><b style={{ background: theme.accentColor }} /><i /><i /><em style={{ background: theme.accentColor }} /><i /><i /><i /></span><span><strong>{t.name}{t.atsSafe && <span className="template-ats-badge" title="Single-column ATS-safe reading order"><ShieldCheck size={11} />ATS-safe</span>}</strong><small>{t.note}</small></span><span className="template-check">{activeTemplate.id === t.id && <Check size={16} />}</span></button>)}</div>
    <h3 className="design-label">Accent color</h3><div className="color-swatches">{[{ value: '#2557a7', name: 'Ocean blue' }, { value: '#253448', name: 'Slate' }, { value: '#22665e', name: 'Forest' }, { value: '#8f4d3a', name: 'Terracotta' }, { value: '#65558f', name: 'Iris' }, { value: '#1e293b', name: 'Charcoal' }].map(c => <button key={c.value} style={{ background: c.value }} className="color-swatch" aria-label={`Use ${c.name} accent`} aria-pressed={theme.accentColor === c.value} onClick={() => update({ accentColor: c.value })}>{theme.accentColor === c.value && <Check size={17} />}</button>)}</div>
    <div className="design-controls"><label className="builder-field"><span>Typography</span><select value={theme.fontFamily} onChange={e => update({ fontFamily: e.target.value as typeof theme.fontFamily })}><option value="sans">Sans serif — clean &amp; modern</option><option value="serif">Serif — classic &amp; editorial</option><option value="mono">Monospace — technical</option></select></label><label className="builder-field"><span>Text size</span><select value={theme.fontSize} onChange={e => update({ fontSize: e.target.value as typeof theme.fontSize })}><option value="small">Small · 10 pt</option><option value="medium">Medium · 11 pt</option><option value="large">Large · 12 pt</option></select></label><label className="builder-field"><span>Line spacing</span><select value={theme.lineSpacing} onChange={e => update({ lineSpacing: e.target.value as typeof theme.lineSpacing })}><option value="compact">Compact</option><option value="normal">Balanced</option><option value="relaxed">Relaxed</option></select></label><label className="builder-field"><span>Page margins{theme.fitOnePage ? ' (32 pt while Fit to 1 page is on)' : ''}</span><select value={theme.pageMargins ?? 'normal'} disabled={Boolean(theme.fitOnePage)} onChange={e => update({ pageMargins: e.target.value as 'narrow' | 'normal' | 'wide' })}><option value="narrow">Narrow · 32 pt</option><option value="normal">{normalMarginLabel}</option><option value="wide">Wide · 52 pt</option></select></label><label className="builder-field"><span>Paper size</span><select value={theme.pageSize ?? 'A4'} onChange={e => update({ pageSize: e.target.value as 'A4' | 'Letter' })}><option value="A4">A4 (210 × 297 mm)</option><option value="Letter">US Letter (8.5 × 11 in)</option></select></label></div>
    <div className="design-toggles">
      <label className="design-toggle-row">
        <div><strong>Fit to 1 page</strong><span>Tightens margins, font size, and spacing so borderline 2-page resumes stay on one page.</span></div>
        <input type="checkbox" role="switch" checked={Boolean(theme.fitOnePage)} onChange={e => update({ fitOnePage: e.target.checked })} />
      </label>
      <label className="design-toggle-row">
        <div><strong>Compact certifications (2 columns)</strong><span>Displays certifications in a crisp 2-column grid to save vertical space.</span></div>
        <input type="checkbox" role="switch" checked={Boolean(theme.compactCertifications)} onChange={e => update({ compactCertifications: e.target.checked })} />
      </label>
      {Boolean(activeProfileId) && <button type="button" className="secondary-button" onClick={runAutoFormat}><Sparkles size={15} />Auto-format for best fit</button>}
      {fitNote && <p className="subtle-note" role="status">{fitNote}</p>}
    </div>
    <div className="design-note"><strong>Designed for readability</strong><p>Single-column layouts, selectable text, and a clear hierarchy. Preview the PDF to check final page breaks.</p></div>
  </div>;
}
