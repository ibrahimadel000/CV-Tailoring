export type JobPassage = { id: string; text: string; priority: 'required' | 'preferred' | 'responsibility' };
export type JobInventory = { passages: JobPassage[]; warnings: string[] };

export function jobInventory(job: string): JobInventory {
  const plain = job.replace(/<br\s*\/?\s*>|<\/(?:p|li|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&');
  const lines = plain.split(/\n+/).map(line => line.replace(/^\s*[•▪●*\-]+\s*/, '').trim()).filter(Boolean);
  const hasSections = lines.some(line => /^(?:required qualifications|required skills|requirements|minimum qualifications|must[- ]have|preferred qualifications|key responsibilities|responsibilities|المتطلبات|المسؤوليات)\s*:?$/i.test(line));
  let mode: JobPassage['priority'] | null = hasSections ? null : 'responsibility';
  const rows: JobPassage[] = [], seen = new Set<string>();
  let tooLong = 0;
  for (const text of lines) {
    if (/^(?:required qualifications|required skills|requirements|minimum qualifications|must[- ]have|المتطلبات|الشروط)\s*:?$/i.test(text)) { mode = 'required'; continue; }
    if (/^(?:preferred qualifications|preferred skills|nice[- ]to[- ]have|preferred|يفضل)\s*:?$/i.test(text)) { mode = 'preferred'; continue; }
    if (/^(?:key responsibilities|responsibilities|duties|what you(?:'|’)ll do|المسؤوليات)\s*:?$/i.test(text)) { mode = 'responsibility'; continue; }
    if (/^(?:compensation|application process|benefits|about the company|about the opportunity|about the job|how to apply)\s*:?$/i.test(text)) { mode = null; continue; }
    if (!mode) continue;
    // Split only at sentence boundaries, never at commas/'or'/'and' inside a claim.
    for (const unit of text.split(/(?<=[.!?])\s+(?=[A-Z•])/)) {
      if (unit.length < 20 || /\$|\b(?:salary|compensation|positions available|screening questions|hiring manager|onboarding and begin|per week|working hours|submit your application|interview|no prior .{0,45}experience (?:is )?required)\b/i.test(unit)) continue;
      if (unit.length > 280) { tooLong++; continue; }
      const key = unit.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key); rows.push({ id: `r${rows.length + 1}`, text: unit, priority: mode });
    }
  }
  const warnings: string[] = [];
  if (tooLong) warnings.push(`Job extraction: ${tooLong} long requirement unit(s) could not be indexed without cutting their meaning. The full job is still sent to the writer; assessment coverage is incomplete.`);
  if (rows.length > 60) warnings.push(`Job extraction: ${rows.length - 60} requirement unit(s) exceed the 60-item assessment limit. The full job is still sent; assessment coverage is incomplete.`);
  return { passages: [...rows.filter(r => r.priority === 'required'), ...rows.filter(r => r.priority !== 'required')].slice(0, 60), warnings };
}
export function jobPassages(job: string): JobPassage[] { return jobInventory(job).passages; }
