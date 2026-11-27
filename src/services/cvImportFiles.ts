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
function xmlText(xml: string, listStyles = new Set<string>(), links = new Map<string, string>()): { text: string; hasImages: boolean; hasTables: boolean; hasRevisions: boolean; textboxCount: number; tableRegions?: string[] } {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new CVImportError('xml', 'Document XML declarations are unsupported. Save a standard DOCX copy.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.getElementsByTagNameNS('*', 'parsererror').length) throw new CVImportError('xml', 'The DOCX text is damaged and could not be read.');
  const paragraphs = [...doc.getElementsByTagNameNS(WORD_NS, 'p')];
  const normUrl = (u: string) => u.trim().replace(/^(?:mailto:|https?:\/\/)(?:www\.)?/i, '').replace(/\/+$/, '').toLowerCase();
  const walk = (node: Node, root: Node, acc: { text: string }): string => {
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    if (el.localName === 'Fallback') return '';
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
  const visible = (p: Element) => { let parent = p.parentElement; while (parent) { if ((parent.namespaceURI === WORD_NS && parent.localName === 'del') || parent.localName === 'Fallback') return false; parent = parent.parentElement; } return true; };
  const lineOf = (p: Element) => {
    const raw = walk(p, p, { text: '' }).trim();
    const t = raw.replace(/(?:\s*\|\s*){2,}/g, ' | ').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim();
    const style = p.getElementsByTagNameNS(WORD_NS, 'pStyle')[0]?.getAttributeNS(WORD_NS, 'val') || '';
    const numbered = p.getElementsByTagNameNS(WORD_NS, 'numPr').length > 0 || listStyles.has(style);
    const alreadyBulleted = /^[•●▪◦‣–—*-]\s/.test(t);
    return (numbered && t && !alreadyBulleted ? '• ' : '') + t;
  };
  const insideTextbox = (p: Element) => {
    let parent = p.parentElement;
    while (parent) {
      if (parent.namespaceURI === WORD_NS && parent.localName === 'txbxContent') return true;
      parent = parent.parentElement;
    }
    return false;
  };
  const textboxes = [...doc.getElementsByTagNameNS(WORD_NS, 'txbxContent')].filter(box => visible(box) && !insideTextbox(box));
  const textboxCount = textboxes.length;
  let lines: string[];
  if (textboxCount >= 2) {
    // Isolate floating textboxes from main flow so sidebar boxes never splice into Profile/Experience paragraphs
    const mainLines = paragraphs.filter(p => visible(p) && !insideTextbox(p)).map(lineOf);
    const seenBoxes = new Set<string>();
    const boxLines: string[] = [];
    for (const box of textboxes) {
      const bLines = [...box.getElementsByTagNameNS(WORD_NS, 'p')].filter(visible).map(lineOf).filter(Boolean);
      const joined = bLines.join('\n').trim();
      if (!joined || seenBoxes.has(joined)) continue;
      seenBoxes.add(joined);
      boxLines.push('', ...bLines);
    }
    lines = [...mainLines, ...boxLines];
  } else {
    lines = paragraphs.filter(visible).map(lineOf);
  }
  // Recognize only a whole-document, single-row sidebar-left / named-main-right layout.
  // Ordinary data tables, nested/merged cells and mixed body content keep the
  // previous document-order extraction. Independent regions prevent a sidebar's
  // last section from swallowing the next cell's candidate name and headline.
  const body = doc.getElementsByTagNameNS(WORD_NS, 'body')[0];
  const bodyChildren = body ? [...body.children] : [];
  const tables = bodyChildren.filter(e => e.namespaceURI === WORD_NS && e.localName === 'tbl');
  let tableRegions: string[] | undefined;
  if (body && textboxCount < 2 && tables.length === 1 && body.getElementsByTagNameNS(WORD_NS, 'tbl').length === 1 &&
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
  return { text: tableRegions ? tableRegions.join('\n\n') : lines.join('\n'), tableRegions, textboxCount, hasImages: doc.getElementsByTagNameNS(WORD_NS, 'drawing').length > 0, hasTables: doc.getElementsByTagNameNS(WORD_NS, 'tbl').length > 0, hasRevisions: doc.getElementsByTagNameNS(WORD_NS, 'del').length + doc.getElementsByTagNameNS(WORD_NS, 'ins').length > 0 };
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
  let pageSize: 'A4' | 'Letter' | undefined;
  try {
    const docXml = safeXML(strFromU8(files['word/document.xml']));
    const pgSz = docXml.getElementsByTagNameNS(WORD_NS, 'pgSz')[0];
    if (pgSz) {
      const w = Number(pgSz.getAttributeNS(WORD_NS, 'w') || pgSz.getAttribute('w:w') || 0);
      const h = Number(pgSz.getAttributeNS(WORD_NS, 'h') || pgSz.getAttribute('w:h') || 0);
      if (w > 0 && h > 0) {
        pageSize = Math.abs(w - 12240) <= 320 && Math.abs(h - 15840) <= 320 ? 'Letter' : 'A4';
      }
    }
  } catch {}
  let text = main.text; const warnings: string[] = [];
  const regions: ImportRegion[] | undefined = main.tableRegions?.map((part, i) => ({page: 1, lane: i === 0 ? 'left' : 'right', text: part}));
  const isBoilerplateFooter = (s: string) =>
    /^(?:page\s+)?\d+(?:\s*(?:of|\/)\s*\d+)?$/i.test(s.trim()) ||
    /^confidential$/i.test(s.trim());
  for (const name of [...selected].filter(n => /^word\/(?:header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(n)).sort()) {
    checkAbort(signal); const part = parsePart(name).text.trim();
    if (!part || text.includes(part)) continue;
    if (/^word\/header/.test(name)) {
      text = part + '\n\n' + text;
      regions?.unshift({page: 1, lane: 'full', text: part});
    } else if (/^word\/footer/.test(name)) {
      const usefulLines = part.split('\n').map(l => l.trim()).filter(l => l && !isBoilerplateFooter(l));
      if (usefulLines.length && usefulLines.some(l => /@|https?:\/\/|linkedin\.com|github\.com|\+?\d[\d ()-]{7,}\d/i.test(l))) {
        const footerContacts = usefulLines.join(' · ');
        text = footerContacts + '\n\n' + text;
        regions?.unshift({ page: 1, lane: 'full', text: footerContacts });
      }
    } else {
      const tail = 'IMPORTED NOTES\n' + part;
      text += '\n\n' + tail;
      regions?.push({page: 1, lane: 'full', text: tail});
    }
  }
  if (main.hasImages) warnings.push('Images and photos in the DOCX were not imported. You can add a photo in Personal details.');
  if (main.hasTables) warnings.push(main.tableRegions ? 'Table cells were read as separate sections. Check section placement against the original.' : 'Table cells were read in document order. Check section placement for multi-column layouts.');
  if (main.hasRevisions) warnings.push('Tracked insertions were included and tracked deletions excluded. Review the extracted text.');
  const complexLayout = main.textboxCount >= 4;
  if (complexLayout) warnings.push('This DOCX uses floating textboxes for its layout. Review section placement or use AI import for best structure.');
  return { text: validateImportText(text), warnings, pageSize, regions, ...(complexLayout ? { complexLayout: true } : {}) };
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
    let pageSize: 'A4' | 'Letter' | undefined;
    for (let n = 1; n <= doc.numPages; n++) {
      checkAbort(signal); const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      if (n === 1) {
        pageSize = Math.abs(viewport.width - 612) <= 14 && Math.abs(viewport.height - 792) <= 14 ? 'Letter' : 'A4';
      }
      const content = await page.getTextContent();
      const result = pdfPageLines(content.items.filter((i): i is typeof i & PositionedText => 'str' in i), viewport.width, viewport.height, n);
      // Extract clickable Page-1 PDF Link annotations (LinkedIn/GitHub/Portfolio icons) not already present in plain text
      let pageText = result.text;
      if (n === 1) {
        try {
          const annots = await page.getAnnotations();
          const normLink = (u: string) => u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
          const normPageText = pageText.toLowerCase().replace(/https?:\/\//g, '').replace(/www\./g, '');
          const extraLinks: string[] = [];
          for (const a of annots) {
            const rawUrl = typeof a?.url === 'string' ? a.url : typeof a?.unsafeUrl === 'string' ? a.unsafeUrl : '';
            if (!rawUrl || !/^(?:https?:|mailto:)/i.test(rawUrl)) continue;
            const cleaned = rawUrl.replace(/^mailto:/i, '').trim();
            const nKey = normLink(cleaned);
            if (cleaned && nKey && !normPageText.includes(nKey) && !extraLinks.some(x => normLink(x) === nKey)) {
              extraLinks.push(cleaned);
            }
          }
          if (extraLinks.length) {
            const linkLine = extraLinks.join(' · ');
            if (result.regions.length) {
              result.regions[0] = { ...result.regions[0], text: `${linkLine}\n${result.regions[0].text}`.trim() };
              pageText = result.regions.map(r => r.text).join('\n\n').trim();
            } else {
              pageText = `${linkLine}\n${pageText}`.trim();
            }
          }
        } catch {}
      }
      regions.push(...result.regions);
      if (result.complex) warnings.push(`Two text columns were detected on page ${n} and read separately. Check section placement against the original.`);
      if (pageText.replace(/\s/g, '').length < 15) emptyPages.push(n);
      pages.push(pageText); length += pageText.length;
      if (length > IMPORT_MAX_TEXT) throw new CVImportError('length', 'Extracted text exceeds 100,000 characters. Nothing was imported.');
      page.cleanup();
    }
    const joined = pages.join('\n\n');
    const alphaNumCount = (joined.match(/[\p{L}\p{N}]/gu) || []).length;
    if (alphaNumCount < 20) {
      // Scanned / image-only PDF: render up to 3 pages as JPEG for Tier-2 AI Vision fallback when in browser
      const images: { mimeType: 'image/jpeg'; data: string }[] = [];
      if (typeof document !== 'undefined') {
        const limit = Math.min(doc.numPages, 3);
        for (let n = 1; n <= limit; n++) {
          checkAbort(signal);
          const page = await doc.getPage(n);
          const vp = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            const b64 = dataUrl.split(',')[1] || '';
            if (b64) images.push({ mimeType: 'image/jpeg', data: b64 });
          }
          page.cleanup();
        }
      }
      if (images.length) {
        return { text: '', warnings, pages: doc.numPages, pageSize, needsAiVision: true, images };
      }
      throw new CVImportError('text', 'Not enough readable text was found. Scanned/image-only PDFs need AI vision or OCR.');
    }
    if (emptyPages.length && emptyPages.length < doc.numPages) warnings.push(`Little or no text was found on page(s) ${emptyPages.join(', ')}. Image text is not read; check the original for missing content.`);
    const text = validateImportText(joined);
    return { text, warnings, pages: doc.numPages, pageSize, regions: warnings.some(w => w.startsWith('Two text columns')) ? regions : undefined };
  } catch (error) {
    checkAbort(signal);
    if (error instanceof CVImportError) throw error;
    if (error instanceof Error && error.name === 'PasswordException') throw new CVImportError('password', 'This PDF is password protected. Upload an unlocked copy that you are allowed to use.');
    throw new CVImportError('pdf', 'This PDF could not be read. It may be damaged or unsupported. Try exporting a fresh text PDF.');
  } finally {
    signal.removeEventListener('abort', abort); await task.destroy().catch(() => {});
  }
}
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return globalThis.btoa(bin);
}

export async function readCVFile(file: File, signal: AbortSignal): Promise<ExtractedCV> {
  const format = importFormat(file.name, file.size); checkAbort(signal);
  const data = new Uint8Array(await file.arrayBuffer()); checkAbort(signal);
  if (format === 'txt' || format === 'md') {
    const rawText = new TextDecoder('utf-8', { fatal: false }).decode(data);
    return { text: validateImportText(rawText), warnings: [] };
  }
  if (format === 'image') {
    const ext = file.name.split('.').pop()?.toLowerCase();
    let mimeType: 'image/jpeg' | 'image/png' | 'image/webp' =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    let encoded = '';
    if (typeof document !== 'undefined' && typeof createImageBitmap === 'function' && data.byteLength > 900_000) {
      try {
        const bitmap = await createImageBitmap(new Blob([data], { type: mimeType }));
        const maxEdge = 1600;
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          let quality = 0.82;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          let b64 = dataUrl.split(',')[1] || '';
          while (b64.length > 1_800_000 && quality > 0.45) {
            quality -= 0.12;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
            b64 = dataUrl.split(',')[1] || '';
          }
          if (b64) {
            mimeType = 'image/jpeg';
            encoded = b64;
          }
        }
        bitmap.close();
      } catch {}
    }
    if (!encoded) encoded = bytesToBase64(data);
    return {
      text: '',
      warnings: [],
      needsAiVision: true,
      images: [{ mimeType, data: encoded }],
    };
  }
  if (format === 'pdf') {
    if (!new TextDecoder().decode(data.subarray(0, Math.min(1024, data.length))).includes('%PDF-')) throw new CVImportError('signature', 'The selected file is not a PDF. Renaming its extension does not convert it.');
    return extractPDF(data, signal);
  }
  if (data[0] !== 0x50 || data[1] !== 0x4b) throw new CVImportError('signature', 'The selected file is not a standard DOCX. Older .doc or encrypted Word files are unsupported.');
  return extractDocx(data, signal);
}
