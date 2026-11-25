import { pdfPageLines, type PositionedText } from './cvImportLayout';
export { pdfPageLines, type PositionedText } from './cvImportLayout';
import { unzip, strFromU8 } from 'fflate';
import { CVImportError, IMPORT_MAX_PAGES, IMPORT_MAX_TEXT, importFormat, validateImportText, type ExtractedCV, type ImportRegion } from './cvImportModel';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_MAX = 2 * 1024 * 1024;
const XML_TOTAL_MAX = 6 * 1024 * 1024;
const checkAbort = (signal: AbortSignal) => { if (signal.aborted) throw new CVImportError('cancelled', 'Import cancelled. No resume was created.'); };
export function inspectDocxArchive(data: Uint8Array): Set<string> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let pos = data.length - 22; pos >= Math.max(0, data.length - 65557); pos--) {
    if (view.getUint32(pos, true) === 0x06054b50 && pos + 22 + view.getUint16(pos + 20, true) === data.length) { end = pos; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new CVImportError('docx', 'This DOCX archive is invalid or unsupported. Save it again as a standard .docx file.');
  const count = view.getUint16(end + 10, true); const offset = view.getUint32(end + 16, true);
  if (count > 1500 || offset > end || count === 65535) throw new CVImportError('docx', 'This DOCX archive is too complex to import safely.');
  let pos = offset, selectedSize = 0; const selected = new Set<string>(); const names = new Set<string>();
  for (let n = 0; n < count; n++) {
    if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50) throw new CVImportError('docx', 'The DOCX archive is damaged. Save a fresh copy.');
    const flags = view.getUint16(pos + 8, true); const method = view.getUint16(pos + 10, true); const length = view.getUint16(pos + 28, true);
    const next = pos + 46 + length + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
    if (next > end) throw new CVImportError('docx', 'The DOCX archive is damaged.');
    const name = new TextDecoder().decode(data.subarray(pos + 46, pos + 46 + length));
    if (names.has(name)) throw new CVImportError('docx', 'The DOCX archive contains duplicate entries. Save a fresh copy.');
    names.add(name);
    if (/^word\/(?:document|header\d+|footer\d+|footnotes|endnotes|styles)\.xml$/.test(name) || /^word\/_rels\/(?:document|header\d+|footer\d+)\.xml\.rels$/.test(name)) {
      const size = view.getUint32(pos + 24, true); selectedSize += size;
      if ((flags & 1) || ![0, 8].includes(method) || size > XML_MAX || selectedSize > XML_TOTAL_MAX) throw new CVImportError('docx', 'This DOCX is encrypted or exceeds the safe text extraction limit.');
      selected.add(name);
    }
    pos = next;
  }
  if (!selected.has('word/document.xml')) throw new CVImportError('docx', 'This is not a readable DOCX document. Choose a standard .docx file.');
  return selected;
}
function safeXML(xml: string): XMLDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new CVImportError('xml', 'Document XML declarations are unsupported.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagNameNS('*', 'parsererror').length) throw new CVImportError('xml', 'The DOCX text is damaged and could not be read.');
  return doc;
}
function xmlText(xml: string, listStyles = new Set<string>(), links = new Map<string, string>()): { text: string; hasImages: boolean; hasTables: boolean; hasRevisions: boolean; tableRegions?: string[] } {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new CVImportError('xml', 'Document XML declarations are unsupported. Save a standard DOCX copy.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.getElementsByTagNameNS('*', 'parsererror').length) throw new CVImportError('xml', 'The DOCX text is damaged and could not be read.');
  const paragraphs = [...doc.getElementsByTagNameNS(WORD_NS, 'p')];
  const normUrl = (u: string) => u.trim().replace(/^(?:mailto:|https?:\/\/)(?:www\.)?/i, '').replace(/\/+$/, '').toLowerCase();
  const walk = (node: Node, root: Node, acc: { text: string }): string => {
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    if (el !== root && el.namespaceURI === WORD_NS && el.localName === 'p') return '';
    if (el.namespaceURI === WORD_NS) {
      if (['del', 'instrText', 'delText', 'pPr'].includes(el.localName)) return '';
      if (el.localName === 'hyperlink') {
        const label = [...node.childNodes].map(child => walk(child, root, acc)).join('');
        const id = el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || '';
        const target = links.get(id);
        if (!target) return label;
        const nLabel = normUrl(label);
        const nTarget = normUrl(target);
        if (nTarget && nLabel.includes(nTarget)) return label;
        return label + ' ' + target;
      }
      if (el.localName === 't') {
        const chunk = el.textContent || '';
        acc.text += chunk;
        return chunk;
      }
      if (['tab'].includes(el.localName)) {
        const sep = /^[•●▪◦‣–—*-]$/.test(acc.text.trim()) ? ' ' : ' | ';
        acc.text += sep;
        return sep;
      }
      if (['br', 'cr'].includes(el.localName)) {
        acc.text += '\n';
        return '\n';
      }
    }
    return [...node.childNodes].map(child => walk(child, root, acc)).join('');
  };
  const visible = (p: Element) => { let parent = p.parentElement; while (parent) { if (parent.namespaceURI === WORD_NS && parent.localName === 'del') return false; parent = parent.parentElement; } return true; };
  const lineOf = (p: Element) => {
    const t = walk(p, p, { text: '' }).trim();
    const style = p.getElementsByTagNameNS(WORD_NS, 'pStyle')[0]?.getAttributeNS(WORD_NS, 'val') || '';
    const numbered = p.getElementsByTagNameNS(WORD_NS, 'numPr').length > 0 || listStyles.has(style);
    const alreadyBulleted = /^[•●▪◦‣–—*-]\s/.test(t);
    return (numbered && t && !alreadyBulleted ? '• ' : '') + t;
  };
  const lines = paragraphs.filter(visible).map(lineOf);
  // Recognize only a whole-document, single-row sidebar-left / named-main-right layout.
  // Ordinary data tables, nested/merged cells and mixed body content keep the
  // previous document-order extraction. Independent regions prevent a sidebar's
  // last section from swallowing the next cell's candidate name and headline.
  const body = doc.getElementsByTagNameNS(WORD_NS, 'body')[0];
  const bodyChildren = body ? [...body.children] : [];
  const tables = bodyChildren.filter(e => e.namespaceURI === WORD_NS && e.localName === 'tbl');
  let tableRegions: string[] | undefined;
  if (body && tables.length === 1 && body.getElementsByTagNameNS(WORD_NS, 'tbl').length === 1 &&
      bodyChildren.every(e => e.namespaceURI === WORD_NS && (e.localName === 'tbl' || e.localName === 'sectPr' || (e.localName === 'p' && !lineOf(e))))) {
    const table = tables[0], rows = [...table.children].filter(e => e.namespaceURI === WORD_NS && e.localName === 'tr');
    const cells = rows.length === 1 ? [...rows[0].children].filter(e => e.namespaceURI === WORD_NS && e.localName === 'tc') : [];
    const merged = table.getElementsByTagNameNS(WORD_NS, 'gridSpan').length || table.getElementsByTagNameNS(WORD_NS, 'vMerge').length;
    const section = /^(?:contact|contact details|contact information|skills|technical skills|core skills|expertise|languages|profile|professional profile|summary|professional summary|experience|work experience|professional experience|education|projects|certifications|الملخص المهني|المهارات|الخبرات العملية|التعليم)\s*:?$/i;
    if (cells.length === 2 && !merged) {
      const parts = cells.map(cell => [...cell.getElementsByTagNameNS(WORD_NS, 'p')].filter(visible).map(lineOf).join('\n').trim());
      const [left, right] = parts.map(part => part.split('\n').map(line => line.trim()).filter(Boolean));
      const sidebar = /^(?:contact|contact details|contact information|skills|technical skills|core skills|expertise|languages|المهارات)\s*:?$/i;
      const firstRightHeading = right.findIndex(line => section.test(line));
      const header = firstRightHeading > 0 ? right.slice(0, firstRightHeading) : [];
      const plausibleName = (line: string) => /^[\p{L}][\p{L}\p{M} .’'-]{2,85}$/u.test(line) && line.split(/\s+/).length >= 2 && line.split(/\s+/).length <= 7 && !/engineer|developer|manager|designer|analyst|مهندس|مطور|مدير/i.test(line);
      const plausibleTitle = (line: string) => /engineer|developer|manager|designer|analyst|specialist|consultant|student|مهندس|مطور|مدير|طالب|محلل|مصمم/i.test(line) && line.length <= 130;
      if (left.length >= 3 && right.length >= 3 && left.some(line => sidebar.test(line)) && firstRightHeading >= 2 && header.some(plausibleName) && header.some(plausibleTitle)) tableRegions = parts;
    }
  }
  return { text: tableRegions ? tableRegions.join('\n\n') : lines.join('\n'), tableRegions, hasImages: doc.getElementsByTagNameNS(WORD_NS, 'drawing').length > 0, hasTables: doc.getElementsByTagNameNS(WORD_NS, 'tbl').length > 0, hasRevisions: doc.getElementsByTagNameNS(WORD_NS, 'del').length + doc.getElementsByTagNameNS(WORD_NS, 'ins').length > 0 };
}
async function extractDocx(data: Uint8Array, signal: AbortSignal): Promise<ExtractedCV> {
  const selected = inspectDocxArchive(data); checkAbort(signal);
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    let cancel: (() => void) | undefined;
    const abort = () => { cancel?.(); reject(new CVImportError('cancelled', 'Import cancelled.')); };
    signal.addEventListener('abort', abort, { once: true });
    cancel = unzip(data, { filter: info => selected.has(info.name) }, (error, result) => {
      signal.removeEventListener('abort', abort);
      if (error) reject(new CVImportError('docx', 'Could not decompress this DOCX file. Save a fresh copy.')); else resolve(result);
    });
    if (signal.aborted) abort();
  });
  checkAbort(signal);
  const listStyles = new Set<string>();
  if (files['word/styles.xml']) {
    const styles = [...safeXML(strFromU8(files['word/styles.xml'])).getElementsByTagNameNS(WORD_NS, 'style')];
    for (let pass = 0; pass < 8; pass++) for (const style of styles) {
      const id = style.getAttributeNS(WORD_NS, 'styleId') || '';
      const parent = style.getElementsByTagNameNS(WORD_NS, 'basedOn')[0]?.getAttributeNS(WORD_NS, 'val') || '';
      if (style.getElementsByTagNameNS(WORD_NS, 'numPr').length || listStyles.has(parent)) listStyles.add(id);
    }
  }
  const parsePart = (name: string) => {
    const links = new Map<string, string>();
    const relName = 'word/_rels/' + name.slice(5) + '.rels';
    if (files[relName]) for (const r of [...safeXML(strFromU8(files[relName])).getElementsByTagNameNS('*', 'Relationship')]) {
      const target = r.getAttribute('Target') || '';
      if (/\/hyperlink$/.test(r.getAttribute('Type') || '') && /^(https?:|mailto:|tel:)/i.test(target)) links.set(r.getAttribute('Id') || '', target.replace(/^mailto:|^tel:/i, ''));
    }
    return xmlText(strFromU8(files[name]), listStyles, links);
  };
  const main = parsePart('word/document.xml');
  let text = main.text; const warnings: string[] = [];
  const regions: ImportRegion[] | undefined = main.tableRegions?.map((part, i) => ({page: 1, lane: i === 0 ? 'left' : 'right', text: part}));
  for (const name of [...selected].filter(n => /^word\/(?:header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(n)).sort()) {
    checkAbort(signal); const part = parsePart(name).text.trim();
    if (part && !text.includes(part)) {
      if (/^word\/header/.test(name)) { text = part + '\n\n' + text; regions?.unshift({page: 1, lane: 'full', text: part}); }
      else { const tail = (/^word\/footer/.test(name) ? 'IMPORTED FOOTER' : 'IMPORTED NOTES') + '\n' + part; text += '\n\n' + tail; regions?.push({page: 1, lane: 'full', text: tail}); }
    }
  }
  if (main.hasImages) warnings.push('Images and photos in the DOCX were not imported. You can add a photo in Personal details.');
  if (main.hasTables) warnings.push(main.tableRegions ? 'Table cells were read as separate sections. Check section placement against the original.' : 'Table cells were read in document order. Check section placement for multi-column layouts.');
  if (main.hasRevisions) warnings.push('Tracked insertions were included and tracked deletions excluded. Review the extracted text.');
  return { text: validateImportText(text), warnings, regions };
}
async function extractPDF(data: Uint8Array, signal: AbortSignal): Promise<ExtractedCV> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  checkAbort(signal);
  const task = pdfjs.getDocument({ data, isEvalSupported: false });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const doc = await task.promise; checkAbort(signal);
    if (doc.numPages > IMPORT_MAX_PAGES) throw new CVImportError('pages', 'This PDF exceeds the 30-page import limit. Choose a resume-only file.');
    const pages: string[] = []; const regions: ImportRegion[] = []; const warnings: string[] = []; const emptyPages: number[] = [];
    let length = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      checkAbort(signal); const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const result = pdfPageLines(content.items.filter((i): i is typeof i & PositionedText => 'str' in i), page.getViewport({ scale: 1 }).width, page.getViewport({ scale: 1 }).height, n);
      regions.push(...result.regions);
      if (result.complex) warnings.push(`Two text columns were detected on page ${n} and read separately. Check section placement against the original.`);
      if (result.text.replace(/\s/g, '').length < 15) emptyPages.push(n);
      pages.push(result.text); length += result.text.length;
      if (length > IMPORT_MAX_TEXT) throw new CVImportError('length', 'Extracted text exceeds 100,000 characters. Nothing was imported.');
      page.cleanup();
    }
    if (emptyPages.length && emptyPages.length < doc.numPages) warnings.push(`Little or no text was found on page(s) ${emptyPages.join(', ')}. Image text is not read; check the original for missing content.`);
    const text = validateImportText(pages.join('\n\n'));
    return { text, warnings, pages: doc.numPages, regions: warnings.some(w => w.startsWith('Two text columns')) ? regions : undefined };
  } catch (error) {
    checkAbort(signal);
    if (error instanceof CVImportError) throw error;
    if (error instanceof Error && error.name === 'PasswordException') throw new CVImportError('password', 'This PDF is password protected. Upload an unlocked copy that you are allowed to use.');
    throw new CVImportError('pdf', 'This PDF could not be read. It may be damaged or unsupported. Try exporting a fresh text PDF.');
  } finally {
    signal.removeEventListener('abort', abort); await task.destroy().catch(() => {});
  }
}
export async function readCVFile(file: File, signal: AbortSignal): Promise<ExtractedCV> {
  const format = importFormat(file.name, file.size); checkAbort(signal);
  const data = new Uint8Array(await file.arrayBuffer()); checkAbort(signal);
  if (format === 'pdf') {
    if (!new TextDecoder().decode(data.subarray(0, Math.min(1024, data.length))).includes('%PDF-')) throw new CVImportError('signature', 'The selected file is not a PDF. Renaming its extension does not convert it.');
    return extractPDF(data, signal);
  }
  if (data[0] !== 0x50 || data[1] !== 0x4b) throw new CVImportError('signature', 'The selected file is not a standard DOCX. Older .doc or encrypted Word files are unsupported.');
  return extractDocx(data, signal);
}
