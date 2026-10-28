import type { JobAssessment } from '@/types/schema';
import type { JobPassage } from './job';
import type { applyTailorPatch } from '@/services/tailorModel';
const key = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
// Coverage is app-owned. A missing/invalid model row is NOT a candidate gap.
export function completeJobAssessment(jobs: JobPassage[], checked: ReturnType<typeof applyTailorPatch>['requirements'], warnings: string[] = []): JobAssessment {
  const rows = jobs.map(job => {
    const row = checked.find(r => key(r.jobQuote) === key(job.text));
    return { id: job.id, priority: job.priority, requirement: job.text.slice(0, 180), jobQuote: job.text,
      status: row?.status ?? 'not_assessed' as const, evidence: row?.evidence ?? [] };
  });
  return { version: 'source-first-b25', inventoryCount: jobs.length,
    assessedCount: rows.filter(r => r.status !== 'not_assessed').length,
    extractionWarnings: warnings.filter(w => w.startsWith('Job extraction:')), rows };
}
