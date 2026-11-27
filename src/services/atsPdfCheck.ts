/**
 * Browser-local ATS readability & PDF text-extraction analyzer.
 * Adapted from Reactive Resume's deterministic ATS rules (MIT License).
 */
import type { CVProfile } from '@/types/schema';
import { pdfPageLines, type PositionedText } from './cvImportLayout';

export type AtsCheckSeverity = 'pass' | 'warning' | 'blocker';

export interface AtsCheckItem {
  id: string;
  label: string;
  severity: AtsCheckSeverity;
  detail: string;
}

export interface ExtractedPdfAtsData {
  text: string;
  pageCount: number;
  complexColumns: boolean;
  emptyPages: number[];
  sizeBytes?: number;
}

export interface AtsReadabilityReport {
  score: number;
  verdict: 'clean' | 'mostly' | 'hard';
  stats: {
    pages: number;
    words: number;
    chars: number;
    sizeKb: number;
  };
  checks: AtsCheckItem[];
  extractedText: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_DIGITS_RE = /\d/g;
const GARBLED_CHAR_RE = /[\uFFFD\uE000-\uF8FF]/g;
const PRESENT_RE = /\b(?:present|current|now|ongoing|expected|to\s+date)\b/i;

function classifyDateFormat(raw: string): 'month-year' | 'numeric' | 'year-only' | 'present' | 'other' {
  const s = raw.trim();
  if (!s) return 'other';
  if (PRESENT_RE.test(s)) return 'present';
  if (/^(?:19|20)\d{2}$/.test(s)) return 'year-only';
  if (
    /^(?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}$/.test(s) ||
    /^(?:19|20)\d{2}[/-](?:0?[1-9]|1[0-2])(?:[/-](?:0?[1-9]|[12]\d|3[01]))?$/.test(s)
  ) {
    return 'numeric';
  }
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2}$/i.test(s)) {
    return 'month-year';
  }
  return 'other';
}

function extractComparableYearMonth(raw: string): number | null {
  const s = raw.trim();
  if (!s || PRESENT_RE.test(s)) return null;
  const yearMatch = s.match(/\b((?:19|20)\d{2})\b/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);
  const monthNames: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  const mWord = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i);
  if (mWord) return year * 100 + (monthNames[mWord[1].toLowerCase()] ?? 1);
  const mNum =
    s.match(/^(0?[1-9]|1[0-2])[/-](?:19|20)\d{2}$/) ||
    s.match(/^(?:19|20)\d{2}[/-](0?[1-9]|1[0-2])(?:[/-](?:0?[1-9]|[12]\d|3[01]))?$/);
  if (mNum) return year * 100 + Number(mNum[1]);
  return year * 100;
}

function isReversedDateRange(startVal: number | null, endVal: number | null): boolean {
  if (startVal === null || endVal === null) return false;
  if (startVal % 100 === 0 || endVal % 100 === 0) {
    return Math.floor(startVal / 100) > Math.floor(endVal / 100);
  }
  return startVal > endVal;
}

function isValidUrlLike(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (/\s/.test(trimmed)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

export function analyzeAtsReadability(
  profile: CVProfile,
  extracted?: ExtractedPdfAtsData,
): AtsReadabilityReport {
  const checks: AtsCheckItem[] = [];
  let score = 100;
  let scoreCap = 100;

  const text = (extracted?.text ?? '').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const chars = text.length;
  const pages = extracted?.pageCount ?? 1;
  const sizeKb = extracted?.sizeBytes ? Math.max(1, Math.round(extracted.sizeBytes / 1024)) : 0;

  // 1. Selectable text layer
  if (extracted) {
    const cleanChars = text.replace(/\s+/g, '').length;
    if (cleanChars < 40) {
      checks.push({
        id: 'selectable-text',
        label: 'Selectable text layer',
        severity: 'blocker',
        detail: 'Almost no selectable text was found in this PDF. ATS portals cannot read image-only scans.',
      });
      score -= 60;
      scoreCap = Math.min(scoreCap, 10);
    } else if (extracted.emptyPages.length > 0) {
      checks.push({
        id: 'selectable-text',
        label: 'Selectable text layer',
        severity: 'warning',
        detail: `Page ${extracted.emptyPages.join(', ')} has little or no selectable text.`,
      });
      score -= 12;
    } else {
      checks.push({
        id: 'selectable-text',
        label: 'Selectable text layer',
        severity: 'pass',
        detail: `All ${pages} ${pages === 1 ? 'page contains' : 'pages contain'} real selectable text (${words} words).`,
      });
    }
  }

  // 2. Contact details parsed cleanly
  const header = profile.resumeHeader.data;
  const name = header.name?.trim() || [header.firstName, header.lastName].filter(Boolean).join(' ').trim();
  const email = header.email?.trim() || '';
  const phone = header.phone?.trim() || '';
  const phoneDigits = (phone.match(PHONE_DIGITS_RE) || []).length;
  const contactIssues: string[] = [];
  if (!name) contactIssues.push('name is missing');
  if (!email) contactIssues.push('email is missing');
  else if (!EMAIL_RE.test(email)) contactIssues.push('email format looks invalid');
  else if (extracted && !text.toLowerCase().includes(email.toLowerCase())) {
    contactIssues.push('email was not detected in extracted PDF text');
  }
  if (header.showPhone !== false && phone && phoneDigits < 7) {
    contactIssues.push('phone number looks incomplete');
  }

  if (contactIssues.length) {
    checks.push({
      id: 'contact-details',
      label: 'Contact details',
      severity: 'warning',
      detail: `Check header contact info: ${contactIssues.join('; ')}.`,
    });
    score -= 10;
  } else {
    checks.push({
      id: 'contact-details',
      label: 'Contact details',
      severity: 'pass',
      detail: 'Name and email are valid and readable by ATS parsers.',
    });
  }

  // 3. Links validity
  const rawLinks = [
    header.showLinkedin !== false ? header.linkedin : '',
    header.showGithub !== false ? header.github : '',
    header.showPortfolio !== false ? header.portfolio : '',
    header.showOtherUrl !== false ? header.otherUrl : '',
    ...(profile.projects.hidden ? [] : profile.projects.data.filter(p => !p.hidden).map(p => p.url || '')),
  ].filter(Boolean) as string[];
  const badLinks = rawLinks.filter(u => !isValidUrlLike(u));
  if (badLinks.length) {
    checks.push({
      id: 'links-valid',
      label: 'Profile & project links',
      severity: 'warning',
      detail: `${badLinks.length} link${badLinks.length === 1 ? '' : 's'} may not parse cleanly as a URL.`,
    });
    score -= 6;
  } else if (rawLinks.length > 0) {
    checks.push({
      id: 'links-valid',
      label: 'Profile & project links',
      severity: 'pass',
      detail: `All ${rawLinks.length} URL${rawLinks.length === 1 ? '' : 's'} are cleanly formatted.`,
    });
  }

  // 4. Reading order / columns
  if (extracted) {
    if (extracted.complexColumns) {
      checks.push({
        id: 'reading-order',
        label: 'Reading order',
        severity: 'warning',
        detail: 'Multi-column text flow detected. Review the plain text below to verify reading order.',
      });
      score -= 10;
    } else {
      checks.push({
        id: 'reading-order',
        label: 'Reading order',
        severity: 'pass',
        detail: 'Clean single-column top-to-bottom reading order.',
      });
    }
  }

  // 5. Core standard sections (visible entries only)
  const visibleExp = profile.experience.hidden ? [] : profile.experience.data.filter(e => !e.hidden);
  const visibleProj = profile.projects.hidden ? [] : profile.projects.data.filter(p => !p.hidden);
  const visibleEdu = profile.education.hidden ? [] : profile.education.data.filter(e => !e.hidden);
  const visibleSkills = profile.skills.hidden ? [] : profile.skills.data;
  const missingSections: string[] = [];
  if (visibleExp.length === 0 && visibleProj.length === 0) {
    missingSections.push('Experience or Projects');
  }
  if (visibleSkills.length === 0) missingSections.push('Skills');
  if (visibleEdu.length === 0) missingSections.push('Education');
  if (missingSections.length) {
    checks.push({
      id: 'standard-headings',
      label: 'Core resume sections',
      severity: 'warning',
      detail: `Consider adding: ${missingSections.join(', ')}.`,
    });
    score -= 8;
  } else {
    checks.push({
      id: 'standard-headings',
      label: 'Core resume sections',
      severity: 'pass',
      detail: 'Standard ATS sections (Experience, Education, Skills) are populated.',
    });
  }

  // 6. Date consistency & reversed ranges (skip when no visible dated sections exist)
  if (visibleExp.length > 0 || visibleEdu.length > 0) {
    const dateFormats = new Set<string>();
    let reversedCount = 0;
    let missingExpDates = 0;
    for (const exp of visibleExp) {
      if (!exp.startDate?.trim() && !exp.endDate?.trim()) {
        missingExpDates++;
        continue;
      }
      const sFmt = classifyDateFormat(exp.startDate || '');
      const eFmt = classifyDateFormat(exp.endDate || '');
      if (sFmt !== 'other' && sFmt !== 'present') dateFormats.add(sFmt);
      if (eFmt !== 'other' && eFmt !== 'present') dateFormats.add(eFmt);
      const sVal = extractComparableYearMonth(exp.startDate || '');
      const eVal = extractComparableYearMonth(exp.endDate || '');
      if (isReversedDateRange(sVal, eVal)) reversedCount++;
    }
    for (const edu of visibleEdu) {
      const start = edu.startDate || '';
      const end = edu.endDate || edu.graduationDate || '';
      const sFmt = classifyDateFormat(start);
      const eFmt = classifyDateFormat(end);
      if (sFmt !== 'other' && sFmt !== 'present') dateFormats.add(sFmt);
      if (eFmt !== 'other' && eFmt !== 'present') dateFormats.add(eFmt);
      const sVal = extractComparableYearMonth(start);
      const eVal = extractComparableYearMonth(end);
      if (isReversedDateRange(sVal, eVal)) reversedCount++;
    }
    const dateIssues: string[] = [];
    if (reversedCount > 0) dateIssues.push(`${reversedCount} date range has a start date after its end date`);
    if (missingExpDates > 0) dateIssues.push(`${missingExpDates} experience ${missingExpDates === 1 ? 'entry is' : 'entries are'} missing dates`);
    if (dateFormats.size > 1) dateIssues.push('mixed date formats (e.g. "2024" and "Jan 2024")');
    if (dateIssues.length) {
      checks.push({
        id: 'date-consistency',
        label: 'Dates & chronology',
        severity: 'warning',
        detail: dateIssues.join('; ') + '.',
      });
      score -= 8;
    } else {
      checks.push({
        id: 'date-consistency',
        label: 'Dates & chronology',
        severity: 'pass',
        detail: 'Dates are consistent and in valid chronological order.',
      });
    }
  }

  // 7. Garbled characters / font encoding
  if (extracted && text) {
    const garbledMatches = text.match(GARBLED_CHAR_RE) || [];
    if (garbledMatches.length >= 2) {
      checks.push({
        id: 'garbled-text',
        label: 'Font encoding',
        severity: 'blocker',
        detail: `Detected ${garbledMatches.length} unreadable font glyphs in extracted text.`,
      });
      score -= 40;
      scoreCap = Math.min(scoreCap, 35);
    } else {
      checks.push({
        id: 'garbled-text',
        label: 'Font encoding',
        severity: 'pass',
        detail: 'No broken or garbled characters detected.',
      });
    }
  }

  // 8. File size check
  if (extracted?.sizeBytes !== undefined) {
    const maxBytes = 2 * 1024 * 1024;
    if (extracted.sizeBytes > maxBytes) {
      checks.push({
        id: 'file-size',
        label: 'File size',
        severity: 'warning',
        detail: `PDF is ${sizeKb} KB (over 2 MB). Some job portals reject files above 2 MB.`,
      });
      score -= 8;
    } else {
      checks.push({
        id: 'file-size',
        label: 'File size',
        severity: 'pass',
        detail: `${sizeKb} KB — well under the typical 2 MB portal limit.`,
      });
    }
  }

  const finalScore = Math.max(0, Math.min(scoreCap, score));
  const hasBlocker = checks.some(c => c.severity === 'blocker');
  const verdict: 'clean' | 'mostly' | 'hard' =
    finalScore >= 80 && !hasBlocker ? 'clean' : finalScore >= 50 ? 'mostly' : 'hard';

  return {
    score: finalScore,
    verdict,
    stats: { pages, words, chars, sizeKb },
    checks,
    extractedText: text,
  };
}

export async function extractPdfAtsText(
  blob: Blob,
  signal?: AbortSignal,
): Promise<ExtractedPdfAtsData> {
  const data = new Uint8Array(await blob.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const pdfjs = await import('pdfjs-dist');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjs.getDocument({ data, isEvalSupported: false });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    const emptyPages: number[] = [];
    let complexColumns = false;
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const result = pdfPageLines(
        content.items.filter((i): i is typeof i & PositionedText => 'str' in i),
        viewport.width,
        viewport.height,
        n,
      );
      if (result.complex) complexColumns = true;
      if (result.text.replace(/\s/g, '').length < 15) emptyPages.push(n);
      pages.push(result.text);
      page.cleanup();
    }
    return {
      text: pages.join('\n\n--- Page Break ---\n\n'),
      pageCount: doc.numPages,
      complexColumns,
      emptyPages,
      sizeBytes: blob.size,
    };
  } finally {
    signal?.removeEventListener('abort', abort);
    await task.destroy().catch(() => {});
  }
}
