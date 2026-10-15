import { Check } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
export function DesignPanel() {
  const theme = useAppStore(s => s.documentTheme);
  const update = useAppStore(s => s.setDocumentTheme);
  const templates = [
    { id: 'modern' as const, name: 'Essential', note: 'Clear. Confident. Versatile.', font: 'sans' as const },
    { id: 'classic' as const, name: 'Editorial', note: 'Timeless serif typography.', font: 'serif' as const },
    { id: 'minimal' as const, name: 'Compact', note: 'More room for your story.', font: 'sans' as const },
  ];
  return <div className="design-panel"><p className="design-intro">Choose a layout and fine-tune the details. Your preview updates as you work.</p>
    <h3 className="design-label">Choose a template</h3><div className="template-list">{templates.map(t => <button key={t.id} className={`template-card ${theme.layoutStyle === t.id ? 'selected' : ''}`} aria-pressed={theme.layoutStyle === t.id} onClick={() => update({ layoutStyle: t.id, fontFamily: t.font })}><span className={`mini-resume mini-${t.id}`} aria-hidden="true"><b style={{ background: theme.accentColor }} /><i /><i /><em style={{ background: theme.accentColor }} /><i /><i /><i /></span><span><strong>{t.name}</strong><small>{t.note}</small></span><span className="template-check">{theme.layoutStyle === t.id && <Check size={16} />}</span></button>)}</div>
    <h3 className="design-label">Accent color</h3><div className="color-swatches">{[{ value: '#2557a7', name: 'Ocean blue' }, { value: '#253448', name: 'Slate' }, { value: '#22665e', name: 'Forest' }, { value: '#8f4d3a', name: 'Terracotta' }, { value: '#65558f', name: 'Iris' }].map(c => <button key={c.value} style={{ background: c.value }} className="color-swatch" aria-label={`Use ${c.name} accent`} aria-pressed={theme.accentColor === c.value} onClick={() => update({ accentColor: c.value })}>{theme.accentColor === c.value && <Check size={17} />}</button>)}</div>
    <div className="design-controls"><label className="builder-field"><span>Typography</span><select value={theme.fontFamily} onChange={e => update({ fontFamily: e.target.value as typeof theme.fontFamily })}><option value="sans">Sans serif — clean & modern</option><option value="serif">Serif — classic & editorial</option><option value="mono">Monospace — technical</option></select></label><label className="builder-field"><span>Text size</span><select value={theme.fontSize} onChange={e => update({ fontSize: e.target.value as typeof theme.fontSize })}><option value="small">Small · 10 pt</option><option value="medium">Medium · 11 pt</option><option value="large">Large · 12 pt</option></select></label><label className="builder-field"><span>Line spacing</span><select value={theme.lineSpacing} onChange={e => update({ lineSpacing: e.target.value as typeof theme.lineSpacing })}><option value="compact">Compact</option><option value="normal">Balanced</option><option value="relaxed">Relaxed</option></select></label></div>
    <div className="design-note"><strong>Designed for readability</strong><p>Single-column layouts, selectable text, and a clear hierarchy. Preview the PDF to check final page breaks.</p></div>
  </div>;
}
