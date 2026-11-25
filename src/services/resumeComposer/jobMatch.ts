import type { CVProfile } from '@/types/schema';

export interface JobMatchResult {
  matched: string[];
  listed: string[];
  missing: string[];
}

type TermDef = { label: string; patterns: RegExp[] };

const CATALOG: TermDef[] = [
  // Languages
  { label: 'JavaScript', patterns: [/\bjavascript\b/i] },
  { label: 'TypeScript', patterns: [/\btypescript\b/i] },
  { label: 'Python', patterns: [/\bpython\b/i] },
  { label: 'Go', patterns: [/\bgolang\b/i, /\bGo\b(?!\s+(?:to|beyond|from|through|above|further|fast|deep|live|ahead|with|on|in|for|out|back|up|down)\b)(?=[\s,/.)\]:;،؛]|$)/] },
  { label: 'Rust', patterns: [/\brust\b/i] },
  { label: 'Java', patterns: [/\bjava\b(?!script)/i] },
  { label: 'PHP', patterns: [/\bphp\b/i] },
  { label: 'C#', patterns: [/(?:^|[\s,(/\[:"'،؛و])c#(?=$|[\s,)/.:;\]"'،؛])/i] },
  { label: 'C++', patterns: [/(?:^|[\s,(/\[:"'،؛و])c\+\+(?=$|[\s,)/.:;\]"'،؛])/i] },
  { label: 'SQL', patterns: [/\bsql\b/i] },
  { label: 'HTML', patterns: [/\bhtml5?\b/i] },
  { label: 'CSS', patterns: [/\bcss3?\b/i] },
  // Frontend & Mobile
  { label: 'React', patterns: [/\breact(?:\.js|js)?\b(?!\s+native\b)/i] },
  { label: 'React Native', patterns: [/\breact\s+native\b/i] },
  { label: 'Next.js', patterns: [/\bnext\.?js\b/i] },
  { label: 'Vue', patterns: [/\bvue(?:\.js|js)?\b/i] },
  { label: 'Angular', patterns: [/\bangular\b/i] },
  { label: 'TailwindCSS', patterns: [/\btailwind(?:\s*css)?\b/i] },
  { label: 'Flutter', patterns: [/\bflutter\b/i] },
  // Backend & Architecture
  { label: 'Node.js', patterns: [/\bnode\.?js\b/i] },
  { label: 'Laravel', patterns: [/\blaravel\b/i] },
  { label: 'Django', patterns: [/\bdjango\b/i] },
  { label: 'FastAPI', patterns: [/\bfastapi\b/i] },
  { label: '.NET', patterns: [/(?:^|[\s,(/\[:"'])\.net\b/i, /\basp\.net\b/i] },
  { label: 'RESTful APIs', patterns: [/\brest(?:ful)?\s+(?:apis?|services?)\b/i, /\brest\s*\/\s*graphql\b/i] },
  { label: 'GraphQL', patterns: [/\bgraphql\b/i] },
  { label: 'Microservices', patterns: [/\bmicroservices?\b/i] },
  { label: 'System Architecture', patterns: [/\bsystem\s+architecture\b/i, /\btechnical\s+architectures?\b/i] },
  // Databases
  { label: 'PostgreSQL', patterns: [/\bpostgres(?:ql)?\b/i] },
  { label: 'MySQL', patterns: [/\bmysql\b/i] },
  { label: 'MongoDB', patterns: [/\bmongodb\b/i] },
  { label: 'Redis', patterns: [/\bredis\b/i] },
  { label: 'Firebase / Firestore', patterns: [/\bfirebase\b/i, /\bcloud\s+firestore\b/i, /\bfirestore\b/i] },
  { label: 'Database Management', patterns: [/\b(?:manage|managing)\s+databases?\b/i, /\bdatabase\s+management\b/i] },
  // Cloud & DevOps
  { label: 'AWS', patterns: [/\baws\b/i, /\bamazon\s+web\s+services\b/i] },
  { label: 'Google Cloud', patterns: [/\bgoogle\s+cloud\b/i, /\bgcp\b/i] },
  { label: 'Azure', patterns: [/\bazure\b/i] },
  { label: 'Cloudflare', patterns: [/\bcloudflare\b/i] },
  { label: 'Docker', patterns: [/\bdocker\b/i] },
  { label: 'Kubernetes', patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
  { label: 'Terraform', patterns: [/\bterraform\b/i] },
  { label: 'Linux', patterns: [/\blinux\b/i] },
  { label: 'Git', patterns: [/\bgit\b/i, /\bgithub\b/i, /\bgitlab\b/i] },
  { label: 'CI/CD', patterns: [/\bci\s*[/-]\s*cd\b/i, /\bcontinuous\s+integration\b/i] },
  // Quality, Ops & Product
  { label: 'Automated Testing', patterns: [/\bautomated\s+test(?:ing|s)?\b/i, /\bunit\s+test(?:ing|s)?\b/i, /\b(?:jest|vitest|pytest|playwright|cypress)\b/i] },
  { label: 'Agile / Scrum', patterns: [/\bagile\b/i, /\bscrum\b/i] },
  { label: 'Workflow Automation', patterns: [/\bworkflow\s+automation\b/i, /\bprocess\s+(?:automation|improvement)\b/i] },
  { label: 'Project Management', patterns: [/\bproject\s+management\b/i] },
  { label: 'Business Operations', patterns: [/\bbusiness\s+operations\b/i, /\bproduct\s+operations\b/i] },
  { label: 'Technical Documentation', patterns: [/\btechnical\s+documentation\b/i] },
  { label: 'Browser Extensions', patterns: [/\bbrowser\s+extensions?\b/i] },
  { label: 'Jira', patterns: [/\bjira\b/i] },
  { label: 'Figma', patterns: [/\bfigma\b/i] },
  { label: 'Data Analysis', patterns: [/\bdata\s+analys(?:is|tics)\b/i] },
  { label: 'Excel / Spreadsheets', patterns: [/\bexcel\b/i, /\bspreadsheets?\b/i] },
  { label: 'Dashboards / BI', patterns: [/\bdashboards?\b/i, /\bpower\s*bi\b/i, /\btableau\b/i, /\blooker\b/i] },
  { label: 'KPI Tracking', patterns: [/\bkpis?\b/i] },
  { label: 'AI / LLM Integration', patterns: [/\bllms?\b/i, /\bgenerative\s+ai\b/i, /\bmachine\s+learning\b/i] },
];

const NEGATED_SEGMENT = /\b(?:no\s+prior|not\s+required|no\s+experience\s+(?:required|needed)|without\s+(?:requiring|needing)|but\s+no)\b/i;

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(text));
}

function activeJobSegments(job: string): string[] {
  // Split on sentence boundaries (period followed by whitespace/EOL, not inside Node.js/Next.js)
  // and on Arabic/Latin clause separators.
  return job
    .split(/(?:[\r\n!?;؟؛]+|\.(?=\s|$)|,\s*(?=(?:no\s+prior|not\s+required|no\s+experience\s+(?:required|needed)|without\s+(?:requiring|needing)|but\s+no\b)))/i)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !NEGATED_SEGMENT.test(s));
}

export function analyzeJobMatch(profile: CVProfile, job: string): JobMatchResult {
  const trimmed = job.trim();
  if (trimmed.length < 20) return { matched: [], listed: [], missing: [] };

  const segments = activeJobSegments(trimmed);
  if (!segments.length) return { matched: [], listed: [], missing: [] };

  const customSections = (profile.customSections ?? []).filter(
    c => c.title.trim().toLowerCase() !== 'imported details',
  );
  const customNarrative = customSections.flatMap(c =>
    c.kind === 'experience' ? (c.entries ?? []).flatMap(e => [e.title, e.description]) : [],
  );
  const customListed = customSections.flatMap(c => (c.kind === 'experience' ? [] : c.paragraphs));

  const narrativeText = [
    profile.summary.data,
    ...profile.experience.data.flatMap(e => [e.roleTitle, e.description || '', ...e.bullets.map(b => b.text)]),
    ...profile.projects.data.flatMap(p => [p.name, p.role || '', ...p.bullets.map(b => b.text)]),
    ...customNarrative,
  ].join('\n');

  const listedText = [
    ...profile.skills.data.map(s => `${s.name} ${s.level || ''}`),
    ...profile.education.data.flatMap(e => [e.degree, e.description || '']),
    ...profile.certifications.data.map(c => `${c.name} ${c.issuer || ''}`),
    ...customListed,
  ].join('\n');

  const matched: string[] = [];
  const listed: string[] = [];
  const missing: string[] = [];

  for (const term of CATALOG) {
    const requestedInJob = segments.some(seg => matchesAny(seg, term.patterns));
    if (!requestedInJob) continue;
    if (matchesAny(narrativeText, term.patterns)) {
      matched.push(term.label);
    } else if (matchesAny(listedText, term.patterns)) {
      listed.push(term.label);
    } else {
      missing.push(term.label);
    }
  }

  return { matched, listed, missing };
}
