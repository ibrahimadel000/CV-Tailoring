import { buildExtractedDocument } from './cvImportGeometry';
import type { TextLine, TextSpan, ColumnGutter } from './cvImportGeometryTypes';
import type { ImportRegion } from './cvImportModel';
export interface PositionedText { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean; fontName?: string; dir?: string }

function join(spans: readonly TextSpan[], pageWidth: number): string {
  const isRtl = spans.length > 1 && spans[0].x > spans[spans.length - 1].x;
  let text = ''; let previous: TextSpan | undefined;
  for (const s of spans) {
    const gap = previous
      ? (isRtl ? previous.x - (s.x + s.width) : s.x - previous.x - previous.width)
      : 0;
    if (previous && gap > Math.max(pageWidth * 0.1, Math.max(previous.fontSize, s.fontSize) * 2.5)) text += ' | ';
    else if (previous && gap > Math.max(1.5, Math.max(previous.fontSize, s.fontSize) * 0.2) && !/\s$/.test(text) && !/^\s/.test(s.text)) text += ' ';
    text += s.text; previous = s;
  }
  return text.trim();
}
function regionText(lines: readonly TextLine[], width: number): string {
  const result: string[] = []; let previous: TextLine | undefined;
  for (const line of lines) {
    if (previous && line.y - previous.y > Math.max(previous.height, line.height) * 1.9) result.push('');
    result.push(join(line.spans, width)); previous = line;
  }
  return result.join('\n').trim();
}
function convincing(g: ColumnGutter | null): g is ColumnGutter {
  return !!g && g.coverage >= 0.78 && g.splitRatio >= 0.12;
}
const substantive = (spans: readonly TextSpan[]) => {
  const byRow = new Map<number, string>();
  for (const s of spans) {
    const row = Math.round(s.y / 6);
    byRow.set(row, `${byRow.get(row) ?? ''} ${s.text}`.trim());
  }
  let validRows = 0;
  for (const line of byRow.values()) {
    if ((line.match(/\p{L}/gu) || []).length >= 8 && !/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Present|Expected)\b/i.test(line)) {
      validRows += 1;
    }
  }
  return validRows >= 3;
};

/** Persistent gutters, not a large gap on a single date row, establish columns.
 * Geometric clustering/gutter detection is the MIT Reactive Resume implementation.
 * Regions keep independent section boundaries so a sidebar cannot consume the main CV.
 */
export function pdfPageLines(items: PositionedText[], pageWidth: number, pageHeight = 842, pageNumber = 1): { text: string; complex: boolean; regions: ImportRegion[] } {
  const usable = items.filter(i => i.str.trim() && i.transform.length >= 6 && [...i.transform, i.width, i.height].every(Number.isFinite));
  const raw = { pageNumber, width: pageWidth, height: pageHeight, items: usable.map(i => ({ ...i, fontRef: i.fontName || '' })) };
  const page = buildExtractedDocument({ pages: [raw] }).pages[0];
  if (!page) return { text: '', complex: false, regions: [] };
  let gutter = page.gutter;
  // A full-width identity/header may cross an otherwise persistent body gutter.
  // Remove only wide lines in the top 20% for detection, never from the extracted text.
  if (!convincing(gutter)) {
    const bodyItems = raw.items.filter(i => !(pageHeight - i.transform[5] < pageHeight * 0.2 && i.width > pageWidth * 0.65));
    const body = buildExtractedDocument({ pages: [{ ...raw, items: bodyItems }] }).pages[0];
    if (body && convincing(body.gutter)) gutter = body.gutter;
  }
  if (convincing(gutter)) {
    const x = gutter.x + gutter.width / 2;
    const all = page.lines.flatMap(l => [...l.spans]);
    if (!substantive(all.filter(s => s.x + s.width <= x)) || !substantive(all.filter(s => s.x >= x))) gutter = null;
  }
  if (!convincing(gutter)) {
    const text = regionText(page.lines, pageWidth);
    return { text, complex: false, regions: [{ page: pageNumber, lane: 'full', text }] };
  }
  const split = gutter.x + gutter.width / 2;
  const left: TextLine[] = [], right: TextLine[] = [], wide: TextLine[] = [];
  for (const line of page.lines) {
    const crossing = line.spans.some(s => s.x < split && s.x + s.width > split);
    if (crossing) { wide.push(line); continue; }
    for (const [target, spans] of [[left, line.spans.filter(s => s.x + s.width / 2 < split)], [right, line.spans.filter(s => s.x + s.width / 2 >= split)]] as const) {
      if (spans.length) { const minX = Math.min(...spans.map(s => s.x)); const maxR = Math.max(...spans.map(s => s.x + s.width)); target.push({ ...line, spans, text: join(spans, pageWidth), x: minX, width: Math.max(0, maxR - minX) }); }
    }
  }
  // Crossing rows are kept in their vertical band. Do not move a mid-page wide heading to the top.
  const regions: ImportRegion[] = []; let top = -Infinity;
  const appendBand = (bottom: number) => {
    const columns = ([['left', left], ['right', right]] as const).map(([lane, rows]) => ({ lane, rows: rows.filter(r => r.y > top && r.y < bottom) })).filter(r => r.rows.length).sort((a,b) => a.rows[0].y - b.rows[0].y || (a.lane === 'left' ? -1 : 1));
    for (const {lane, rows} of columns) regions.push({ page: pageNumber, lane, text: regionText(rows, pageWidth) });
  };
  for (const row of wide) { appendBand(row.y); regions.push({ page: pageNumber, lane: 'full', text: regionText([row], pageWidth) }); top = row.y; }
  appendBand(Infinity);
  return { text: regions.map(r => r.text).join('\n\n'), complex: true, regions };
}
