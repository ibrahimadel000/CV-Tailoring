import { COMPOSITION_SNAPSHOT_MAX_BYTES, compositionSnapshotSchema, type CompositionSnapshot, type CVProfile } from '@/types/schema';

// A whitelist, not a copy of the profile. Professional text is kept verbatim,
// including omitted passages; arbitrary personal information typed into these
// fields cannot be reliably identified. Project URLs are excluded deliberately.
function project(profile: CVProfile): CompositionSnapshot['source'] {
  return {
    summary: profile.summary.data,
    experience: profile.experience.data.map(e => ({
      fields: [
        { label: 'Job title', value: e.roleTitle }, { label: 'Organization', value: e.companyName },
        { label: 'Location', value: e.city ?? '' }, { label: 'Start date', value: e.startDate },
        { label: 'End date', value: e.endDate }, { label: 'Overview', value: e.description ?? '' },
      ],
      bullets: e.bullets.map(b => b.text),
    })),
    projects: profile.projects.data.map(e => ({
      fields: [{ label: 'Project name', value: e.name }, { label: 'Project role', value: e.role ?? '' }],
      bullets: e.bullets.map(b => b.text),
    })),
  };
}
// Skip the entire snapshot rather than redact or partially preserve passages.
// Detection is conservative and incomplete; arbitrary sensitive text can remain.
export function captureCompositionSnapshot(source: CVProfile, generated: CVProfile): { snapshot?: CompositionSnapshot; reason?: 'too_large' | 'sensitive_text' } {
  const snapshot: CompositionSnapshot = { version: 'professional-comparison-v1', source: project(source), generated: project(generated) };
  const values = [snapshot.source, snapshot.generated].flatMap(side => [side.summary, ...[...side.experience, ...side.projects].flatMap(e => [...e.fields.map(f => f.value), ...e.bullets])]);
  const h = source.resumeHeader.data;
  const knownContacts = [h.email, h.phone, h.linkedin, h.github, h.portfolio, h.otherUrl].filter((v): v is string => !!v && v.trim().length >= 5).map(v => v.trim().toLocaleLowerCase());
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > COMPOSITION_SNAPSHOT_MAX_BYTES) return { reason: 'too_large' };
  // Bound token checks and use literal scanning so long fields cannot cause
  // pathological regular-expression backtracking.
  const sensitive = (value: string) => {
    const lower = value.toLocaleLowerCase();
    if (lower.includes('](') || knownContacts.some(contact => lower.includes(contact))) return true;
    if (/(?:\b(?:phone|mobile|tel|telephone|whatsapp)[ \t]{0,10}[:：][ \t]{0,10}|\+)[\d ()-]{7,30}/iu.test(value)) return true;
    return lower.split(/[\s<>()\[\]]+/u).some(token => {
      if (token.includes('@') || token.includes('://') || token.startsWith('www.')) return true;
      if (token.length > 300) return false;
      const clean = token.replace(/[.,;!?]+$/u, '');
      return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\//i.test(clean)
        || /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|dev|ai|me|co|edu|gov|app|uk|sa|test|info|cloud|de|fr)(?::\d+)?(?:[?#].*)?$/i.test(clean);
    });
  };
  if (values.some(sensitive)) return { reason: 'sensitive_text' };
  return { snapshot: compositionSnapshotSchema.parse(snapshot) };
}
