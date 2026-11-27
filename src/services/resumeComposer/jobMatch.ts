import type { CVProfile } from '@/types/schema';
import { extractSkillMatchTerms } from './postTailorPolish';
import { containsSkillName } from './summaryBoundary';

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
  // Marketing & Growth
  { label: 'SEO', patterns: [/\bSEO\b/, /\bsearch\s+engine\s+optimization\b/i] },
  { label: 'SEM', patterns: [/\bSEM\b/, /\bsearch\s+engine\s+marketing\b/i] },
  { label: 'Google Ads', patterns: [/\bgoogle\s+ads\b/i] },
  { label: 'Meta Ads', patterns: [/\bmeta\s+ads\b/i, /\bfacebook\s+ads\b/i] },
  { label: 'Google Analytics', patterns: [/\bgoogle\s+analytics\b/i, /\bGA4\b/] },
  { label: 'HubSpot', patterns: [/\bhubspot\b/i] },
  { label: 'Content Marketing', patterns: [/\bcontent\s+(?:marketing|strategy)\b/i] },
  { label: 'Copywriting', patterns: [/\bcopywriting\b/i] },
  { label: 'Social Media Marketing', patterns: [/\bsocial\s+media\s+marketing\b/i] },
  { label: 'Email Marketing', patterns: [/\bemail\s+marketing\b/i] },
  { label: 'Brand Strategy', patterns: [/\bbrand\s+(?:strategy|management)\b/i] },
  { label: 'CRM', patterns: [/\bCRM\b/] },
  // Finance & Accounting
  { label: 'GAAP', patterns: [/\bGAAP\b/] },
  { label: 'IFRS', patterns: [/\bIFRS\b/] },
  { label: 'CPA', patterns: [/\bCPA\b/] },
  { label: 'CFA', patterns: [/\bCFA\b/] },
  { label: 'Financial Modeling', patterns: [/\bfinancial\s+modeling\b/i] },
  { label: 'Financial Reporting', patterns: [/\bfinancial\s+reporting\b/i] },
  { label: 'Budgeting & Forecasting', patterns: [/\bbudgeting\b/i, /\bfinancial\s+forecasting\b/i] },
  { label: 'Tax Preparation', patterns: [/\btax\s+(?:preparation|compliance|returns?|filing)\b/i] },
  { label: 'Auditing', patterns: [/\b(?:financial|internal|external)?\s*auditing\b/i] },
  { label: 'Account Reconciliation', patterns: [/\baccount\s+reconciliation\b/i, /\bgeneral\s+ledger\b/i] },
  { label: 'QuickBooks', patterns: [/\bquickbooks\b/i] },
  { label: 'SAP', patterns: [/\bSAP\b/] },
  { label: 'NetSuite', patterns: [/\bnetsuite\b/i] },
  { label: 'FP&A', patterns: [/\bFP&A\b/] },
  // Healthcare & Nursing
  { label: 'RN', patterns: [/\bRN\b/, /\bregistered\s+nurse\b/i] },
  { label: 'BSN', patterns: [/\bBSN\b/] },
  { label: 'HIPAA', patterns: [/\bHIPAA\b/] },
  { label: 'EHR / EMR', patterns: [/\bEHR\b/, /\bEMR\b/, /\belectronic\s+health\s+records?\b/i] },
  { label: 'Epic', patterns: [/\bEpic\b/] },
  { label: 'ICU / Critical Care', patterns: [/\bICU\b/, /\bcritical\s+care\b/i] },
  { label: 'Triage', patterns: [/\btriage\b/i] },
  { label: 'Patient Care', patterns: [/\bpatient\s+care\b/i] },
  { label: 'BLS / ACLS', patterns: [/\bBLS\b/, /\bACLS\b/] },
  { label: 'Clinical Documentation', patterns: [/\bclinical\s+documentation\b/i] },
  // Civil, Mechanical & Operations Engineering
  { label: 'AutoCAD', patterns: [/\bautocad\b/i] },
  { label: 'SolidWorks', patterns: [/\bsolidworks\b/i] },
  { label: 'Revit', patterns: [/\brevit\b/i] },
  { label: 'Civil 3D', patterns: [/\bcivil\s+3d\b/i] },
  { label: 'Structural Analysis', patterns: [/\bstructural\s+analysis\b/i] },
  { label: 'HVAC', patterns: [/\bHVAC\b/] },
  { label: 'OSHA', patterns: [/\bOSHA\b/] },
  { label: 'Six Sigma / Lean', patterns: [/\bsix\s+sigma\b/i, /\blean\s+(?:manufacturing|operations|six\s+sigma)\b/i] },
  { label: 'Supply Chain Management', patterns: [/\bsupply\s+chain\b/i] },
  { label: 'PMP', patterns: [/\bPMP\b/] },
  // Sales, HR, Legal, Design & Education
  { label: 'Salesforce', patterns: [/\bsalesforce\b/i] },
  { label: 'B2B Sales', patterns: [/\bB2B\b/, /\benterprise\s+sales\b/i] },
  { label: 'Account Management', patterns: [/\baccount\s+management\b/i] },
  { label: 'Contract Negotiation', patterns: [/\bcontract\s+negotiation\b/i] },
  { label: 'Talent Acquisition', patterns: [/\btalent\s+acquisition\b/i, /\bfull[-\s]cycle\s+recruiting\b/i] },
  { label: 'HRIS / Workday', patterns: [/\bHRIS\b/, /\bworkday\b/i] },
  { label: 'Regulatory Compliance', patterns: [/\bregulatory\s+compliance\b/i, /\bGDPR\b/] },
  { label: 'Contract Drafting', patterns: [/\bcontract\s+drafting\b/i, /\blegal\s+research\b/i] },
  { label: 'UI/UX Design', patterns: [/\bUI\s*\/\s*UX\b/i, /\buser\s+research\b/i, /\bwireframing\b/i] },
  { label: 'Adobe Creative Suite', patterns: [/\bphotoshop\b/i, /\billustrator\b/i, /\bindesign\b/i] },
  { label: 'Curriculum Design', patterns: [/\bcurriculum\s+(?:design|development)\b/i, /\binstructional\s+design\b/i] },
];

const NEGATED_SEGMENT = /\b(?:no\s+prior|not\s+required|no\s+experience\s+(?:required|needed)|without\s+(?:requiring|needing)|but\s+no)\b/i;

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(text));
}

// Offer, benefits, perks, and EEO noise stripping (adapted from Reactive Resume's jd/match.ts, MIT).
const OFFER_HEADING = /^(?:benefits|perks|what\s+we\s+offer|compensation(?:\s*(?:&|and)\s*benefits)?|rewards(?:\s*(?:&|and)\s*benefits)?|why\s+(?:join|work\s+(?:with|at))\s+us|equal\s+opportunity(?:\s+employer)?|diversity(?:\s*(?:&|and)\s*inclusion)?|eeo\s+statement|salary(?:\s*(?:&|and)\s*benefits)?)\s*:?$/i;
const WORK_HEADING = /^(?:requirements?|qualifications?|responsibilities|what\s+you(?:'ll|\s+will)\s+do|what\s+you\s+bring|who\s+you\s+are|skills(?:\s*(?:&|and)\s*experience)?|about\s+the\s+role|key\s+responsibilities|minimum\s+qualifications|preferred\s+qualifications|required\s+skills|technical\s+skills)\s*:?$/i;
const OFFER_LINE = /\b(?:401\s*\(?k\)?|health\s*,?\s*dental|dental\s*(?:&|and)\s*vision|paid\s+time\s+off|unlimited\s+pto|parental\s+leave|commuter\s+benefits|gym\s+membership|tuition\s+reimbursement|equal\s+opportunity\s+employer|without\s+regard\s+to\s+race|base\s+salary\s+range|competitive\s+salary\s+and\s+benefits|equity\s+package|stock\s+options)\b/i;

export function stripOfferNoise(job: string): string {
  const lines = job.split(/\r?\n/);
  const kept: string[] = [];
  let inOfferSection = false;
  let inWorkSection = false;
  for (const raw of lines) {
    const clean = raw.replace(/^[\s#•●▪◦‣–—*_-]+/, '').replace(/[*_]+$/, '').trim();
    if (!clean) {
      if (!inOfferSection) kept.push(raw);
      continue;
    }
    if (WORK_HEADING.test(clean)) {
      inOfferSection = false;
      inWorkSection = true;
      kept.push(raw);
      continue;
    }
    if (OFFER_HEADING.test(clean)) {
      inOfferSection = true;
      inWorkSection = false;
      continue;
    }
    // Any other short heading-like line (custom English or non-English) ends an offer/benefits block.
    if (inOfferSection && clean.length <= 50 && (/:$/.test(clean) || /^#{1,4}\s+/.test(raw.trim()))) {
      inOfferSection = false;
      kept.push(raw);
      continue;
    }
    if (inOfferSection) continue;
    if (!inWorkSection && clean.length <= 160 && OFFER_LINE.test(clean)) continue;
    kept.push(raw);
  }
  const filtered = kept.join('\n').trim();
  const minFloor = Math.max(20, Math.floor(job.trim().length * 0.25));
  return filtered.length >= minFloor ? filtered : job.trim();
}

function activeJobSegments(job: string): string[] {
  // Split on sentence boundaries (period followed by whitespace/EOL, not inside Node.js/Next.js)
  // and on Arabic/Latin clause separators.
  return stripOfferNoise(job)
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

  const matchedCatalogTerms: TermDef[] = [];
  for (const term of CATALOG) {
    const requestedInJob = segments.some(seg => matchesAny(seg, term.patterns));
    if (!requestedInJob) continue;
    matchedCatalogTerms.push(term);
    if (matchesAny(narrativeText, term.patterns)) {
      matched.push(term.label);
    } else if (matchesAny(listedText, term.patterns)) {
      listed.push(term.label);
    } else {
      missing.push(term.label);
    }
  }

  // Universal dynamic fallback: also recognize the candidate's own CV skills when named in positive JD clauses,
  // deduplicated against matched CATALOG entries so niche professions always get accurate coverage & lift.
  const positiveText = segments.join('\n');
  const negatedText = trimmed
    .split(/(?:[\r\n!?;؟؛]+|\.(?=\s|$))/i)
    .map(seg => seg.trim())
    .filter(seg => seg.length > 0 && NEGATED_SEGMENT.test(seg))
    .join('\n');
  const seenLabels = new Set([...matched, ...listed, ...missing].map(l => l.toLowerCase()));
  for (const skill of profile.skills.data) {
    const label = skill.name.trim();
    if (!label || seenLabels.has(label.toLowerCase())) continue;
    if (matchedCatalogTerms.some(t => matchesAny(label, t.patterns))) continue;
    const terms = extractSkillMatchTerms(label);
    const inJob = terms.some(term => containsSkillName(positiveText, term) && !containsSkillName(negatedText, term));
    if (!inJob) continue;
    seenLabels.add(label.toLowerCase());
    if (terms.some(term => containsSkillName(narrativeText, term))) {
      matched.push(label);
    } else {
      listed.push(label);
    }
  }

  return { matched, listed, missing };
}

export interface JobMatchComparison {
  before: JobMatchResult;
  after: JobMatchResult;
  total: number;
  coverageBefore: number;
  coverageAfter: number;
  matchedDelta: number;
  newlyDemonstrated: string[];
}

export function reconstructBaselineProfile(active: CVProfile): CVProfile | null {
  const snap = active.compositionSnapshot;
  if (!snap) return null;
  const expById = new Map(snap.experience.map(e => [e.id, e]));
  const projById = new Map(snap.projects.map(p => [p.id, p]));
  return {
    ...active,
    ...(snap.headline !== undefined
      ? {
          headline: { ...active.headline, data: snap.headline },
          resumeHeader: { ...active.resumeHeader, data: { ...active.resumeHeader.data, desiredJobPosition: snap.headline } },
        }
      : {}),
    summary: { ...active.summary, data: snap.summary },
    experience: {
      ...active.experience,
      data: active.experience.data.map(entry => {
        const orig = expById.get(entry.id);
        if (!orig) return entry;
        return {
          ...entry,
          description: orig.description ?? entry.description,
          bullets: orig.bullets.map(b => ({ id: b.id, text: b.text, isVerified: true })),
        };
      }),
    },
    projects: {
      ...active.projects,
      data: active.projects.data.map(proj => {
        const orig = projById.get(proj.id);
        if (!orig) return proj;
        return {
          ...proj,
          bullets: orig.bullets.map(b => ({ id: b.id, text: b.text, isVerified: true })),
        };
      }),
    },
    skills: { ...active.skills, data: snap.skills.map(sk => ({ ...sk })) },
  };
}

export function compareJobMatch(beforeProfile: CVProfile, afterProfile: CVProfile, job: string): JobMatchComparison {
  const before = analyzeJobMatch(beforeProfile, job);
  const after = analyzeJobMatch(afterProfile, job);
  const total = after.matched.length + after.listed.length + after.missing.length;
  const beforeMatchedSet = new Set(before.matched);
  const newlyDemonstrated = after.matched.filter(item => !beforeMatchedSet.has(item));
  return {
    before,
    after,
    total,
    coverageBefore: before.matched.length + before.listed.length,
    coverageAfter: after.matched.length + after.listed.length,
    matchedDelta: after.matched.length - before.matched.length,
    newlyDemonstrated,
  };
}
