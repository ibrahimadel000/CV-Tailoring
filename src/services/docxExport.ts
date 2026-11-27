import { zipSync, strToU8 } from 'fflate';
import type { CVProfile, CustomResumeSection, DocumentTheme, ResumeHeader } from '@/types/schema';
import {
  formatDateRange,
  fullName,
  headline,
  orderedSections,
  plainText,
  themeMetrics,
  type SectionId,
} from '@/components/builder/resumeModel';
import { orderedSkillGroups } from '@/components/builder/skillPresentation';
import { visiblePhoto } from '@/components/builder/photoModel';

export interface DocxExportOptions {
  pageSize?: 'A4' | 'Letter';
}

const ILLEGAL_XML_1_0 = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g;
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function stripIllegalXmlChars(input: string): string {
  const cleaned = (input || '').replace(/\r\n?/g, '\n').replace(ILLEGAL_XML_1_0, '');
  let out = '';
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = cleaned.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += cleaned[i] + cleaned[i + 1];
        i++;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Drop lone low surrogate
    } else {
      out += cleaned[i];
    }
  }
  return out;
}

export function escapeXml(input: string): string {
  return stripIllegalXmlChars(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function isRTLText(input: string): boolean {
  return RTL_RE.test(input || '');
}

export function normalizeExternalUrl(raw: string, kind: 'web' | 'email' = 'web'): string | null {
  const trimmed = stripIllegalXmlChars(raw || '').trim();
  if (!trimmed) return null;
  if (kind === 'email') {
    const email = trimmed.replace(/^mailto:/i, '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : null;
  }
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

class RelationshipRegistry {
  private readonly byTarget = new Map<string, string>();
  private readonly entries: { id: string; type: string; target: string; external: boolean }[] = [];
  private nextId = 2; // rId1 is reserved for styles.xml

  addHyperlink(target: string): string {
    const existing = this.byTarget.get(target);
    if (existing) return existing;
    const id = `rId${this.nextId++}`;
    this.byTarget.set(target, id);
    this.entries.push({
      id,
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
      target,
      external: true,
    });
    return id;
  }

  addImage(target: string): string {
    const id = `rId${this.nextId++}`;
    this.entries.push({
      id,
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
      target,
      external: false,
    });
    return id;
  }

  toRelsXml(): string {
    const links = this.entries
      .map(
        ({ id, type, target, external }) =>
          `  <Relationship Id="${id}" Type="${type}" Target="${escapeXml(target)}"${external ? ' TargetMode="External"' : ''}/>`,
      )
      .join('\n');
    return [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
      ...(links ? [links] : []),
      '</Relationships>',
    ].join('\n');
  }
}

function normalizeHex(color: string | undefined, fallback = '2557A7'): string {
  const cleaned = (color || '').replace(/^#/, '').trim().toUpperCase();
  return /^[0-9A-F]{6}$/.test(cleaned) ? cleaned : fallback;
}

function mapFontFamily(family: DocumentTheme['fontFamily']): { latin: string; cs: string } {
  if (family === 'serif') return { latin: 'Times New Roman', cs: 'Times New Roman' };
  if (family === 'mono') return { latin: 'Courier New', cs: 'Courier New' };
  return { latin: 'Arial', cs: 'Tahoma' };
}

function ptToTwips(pt: number): number {
  return Math.round(pt * 20);
}

function ptToHalfPoints(pt: number): number {
  return Math.round(pt * 2);
}

interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  caps?: boolean;
  underline?: boolean;
  color?: string;
  sizeHp?: number;
  letterSpacingTwips?: number;
  forceLtr?: boolean;
}

function buildRun(text: string, style: RunStyle = {}): string {
  const safe = stripIllegalXmlChars(text);
  if (!safe) return '';
  const rtl = !style.forceLtr && isRTLText(safe);
  const arabic = !style.forceLtr && ARABIC_RE.test(safe);
  const rPrParts: string[] = [];
  if (style.bold) {
    rPrParts.push('<w:b/>');
    if (rtl) rPrParts.push('<w:bCs/>');
  }
  if (style.italic) {
    rPrParts.push('<w:i/>');
    if (rtl) rPrParts.push('<w:iCs/>');
  }
  if (style.caps && !rtl) rPrParts.push('<w:caps/>');
  if (style.color) rPrParts.push(`<w:color w:val="${style.color}"/>`);
  if (style.letterSpacingTwips && !rtl) rPrParts.push(`<w:spacing w:val="${style.letterSpacingTwips}"/>`);
  if (style.sizeHp) rPrParts.push(`<w:sz w:val="${style.sizeHp}"/><w:szCs w:val="${style.sizeHp}"/>`);
  if (style.underline) rPrParts.push('<w:u w:val="single"/>');
  if (style.forceLtr) {
    rPrParts.push('<w:rtl w:val="0"/>');
  } else if (rtl) {
    rPrParts.push('<w:rtl/>');
    if (arabic) rPrParts.push('<w:lang w:bidi="ar-SA"/>');
  }

  const rPr = rPrParts.length ? `<w:rPr>${rPrParts.join('')}</w:rPr>` : '';
  const lines = safe.split('\n');
  const content = lines
    .map((line, idx) => `${idx > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join('');
  return `<w:r>${rPr}${content}</w:r>`;
}

function buildHyperlinkRun(
  label: string,
  url: string,
  rels: RelationshipRegistry,
  colorHex: string,
  sizeHp: number,
  inRtlParagraph: boolean,
  underline = true,
): string {
  const rId = rels.addHyperlink(url);
  const rPrParts = [
    '<w:rStyle w:val="Hyperlink"/>',
    `<w:color w:val="${colorHex}"/>`,
    `<w:sz w:val="${sizeHp}"/><w:szCs w:val="${sizeHp}"/>`,
    underline ? '<w:u w:val="single"/>' : '<w:u w:val="none"/>',
  ];
  if (inRtlParagraph) rPrParts.push('<w:rtl w:val="0"/>');
  return `<w:hyperlink r:id="${rId}" w:history="1"><w:r><w:rPr>${rPrParts.join('')}</w:rPr><w:t xml:space="preserve">${escapeXml(label)}</w:t></w:r></w:hyperlink>`;
}

interface ParagraphOpts {
  styleId?: string;
  align?: 'left' | 'center' | 'right';
  spaceBefore?: number;
  spaceAfter?: number;
  line?: number;
  keepNext?: boolean;
  keepLines?: boolean;
  pageBreakBefore?: boolean;
  topBorder?: { color: string; sz: number; space: number };
  bottomBorder?: { color: string; sz: number; space: number };
  shadingFill?: string;
  rightTabPos?: number;
  hangingIndent?: { left: number; hanging: number };
  bidi?: boolean;
}

function buildParagraph(innerXml: string, opts: ParagraphOpts = {}): string {
  const pPr: string[] = [];
  if (opts.styleId) pPr.push(`<w:pStyle w:val="${opts.styleId}"/>`);
  if (opts.keepNext) pPr.push('<w:keepNext/>');
  if (opts.keepLines) pPr.push('<w:keepLines/>');
  if (opts.pageBreakBefore) pPr.push('<w:pageBreakBefore/>');
  if (opts.topBorder || opts.bottomBorder) {
    const bdrParts: string[] = [];
    if (opts.topBorder) {
      bdrParts.push(`<w:top w:val="single" w:sz="${opts.topBorder.sz}" w:space="${opts.topBorder.space}" w:color="${opts.topBorder.color}"/>`);
    }
    if (opts.bottomBorder) {
      bdrParts.push(`<w:bottom w:val="single" w:sz="${opts.bottomBorder.sz}" w:space="${opts.bottomBorder.space}" w:color="${opts.bottomBorder.color}"/>`);
    }
    pPr.push(`<w:pBdr>${bdrParts.join('')}</w:pBdr>`);
  }
  if (opts.shadingFill) {
    pPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${opts.shadingFill}"/>`);
  }
  if (opts.rightTabPos) {
    pPr.push(`<w:tabs><w:tab w:val="right" w:pos="${opts.rightTabPos}"/></w:tabs>`);
  } else if (opts.hangingIndent) {
    pPr.push(`<w:tabs><w:tab w:val="left" w:pos="${opts.hangingIndent.left}"/></w:tabs>`);
  }
  if (opts.bidi) pPr.push('<w:bidi/>');
  if (opts.spaceBefore !== undefined || opts.spaceAfter !== undefined || opts.line !== undefined) {
    const attrs = [
      opts.spaceBefore !== undefined ? `w:before="${opts.spaceBefore}"` : '',
      opts.spaceAfter !== undefined ? `w:after="${opts.spaceAfter}"` : '',
      opts.line !== undefined ? `w:line="${opts.line}" w:lineRule="auto"` : '',
    ]
      .filter(Boolean)
      .join(' ');
    pPr.push(`<w:spacing ${attrs}/>`);
  }
  if (opts.hangingIndent) {
    pPr.push(`<w:ind w:left="${opts.hangingIndent.left}" w:hanging="${opts.hangingIndent.hanging}"/>`);
  }
  if (opts.align) pPr.push(`<w:jc w:val="${opts.align}"/>`);

  const pPrXml = pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : '';
  return `<w:p>${pPrXml}${innerXml}</w:p>`;
}

interface ContactPiece {
  label: string;
  url: string | null;
}

function collectHeaderContacts(h: ResumeHeader): ContactPiece[] {
  const pieces: ContactPiece[] = [];
  const push = (val: string | undefined, show: boolean | undefined, kind: 'plain' | 'email' | 'web') => {
    const text = plainText(val || '').trim();
    if (!text || show === false) return;
    if (kind === 'email') pieces.push({ label: text, url: normalizeExternalUrl(text, 'email') });
    else if (kind === 'web') pieces.push({ label: text, url: normalizeExternalUrl(text, 'web') });
    else pieces.push({ label: text, url: null });
  };
  push(h.email, true, 'email');
  push(h.phone, h.showPhone, 'plain');
  push(h.location, h.showLocation, 'plain');
  push(h.linkedin, h.showLinkedin, 'web');
  push(h.github, h.showGithub, 'web');
  push(h.portfolio, h.showPortfolio, 'web');
  push(h.otherUrl, h.showOtherUrl, 'web');
  return pieces;
}

function decodeBase64Bytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function parsePhotoDataUri(dataUri: string): { ext: 'png' | 'jpg'; mime: string; bytes: Uint8Array } | null {
  const m = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUri.trim());
  if (!m) return null;
  const rawType = m[1].toLowerCase();
  const ext: 'png' | 'jpg' = rawType === 'png' ? 'png' : 'jpg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  try {
    const bytes = decodeBase64Bytes(m[2].replace(/\s+/g, ''));
    if (!bytes.length) return null;
    return { ext, mime, bytes };
  } catch {
    return null;
  }
}

function buildInlineImageRun(
  relId: string,
  sizePt: number,
  shape: 'circle' | 'rounded' = 'rounded',
  altText = 'Profile photo',
): string {
  const emu = Math.round(sizePt * 12700);
  const geom = shape === 'circle' ? 'ellipse' : 'roundRect';
  return (
    '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${emu}" cy="${emu}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    `<wp:docPr id="1" name="ProfilePhoto" descr="${escapeXml(altText)}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="0" name="ProfilePhoto"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu}" cy="${emu}"/></a:xfrm><a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  );
}

function buildContentTypesXml(photoExt?: 'png' | 'jpg'): string {
  const photoType = photoExt === 'png'
    ? '  <Default Extension="png" ContentType="image/png"/>'
    : photoExt === 'jpg'
      ? '  <Default Extension="jpg" ContentType="image/jpeg"/>'
      : '';
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '  <Default Extension="xml" ContentType="application/xml"/>',
    ...(photoType ? [photoType] : []),
    '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
    '</Types>',
  ].join('\n');
}

function buildRootRelsXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    '</Relationships>',
  ].join('\n');
}

function buildStylesXml(
  latinFont: string,
  csFont: string,
  bodySizeHp: number,
  bodyLine: number,
  accentHex: string,
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '  <w:docDefaults>',
    '    <w:rPrDefault>',
    '      <w:rPr>',
    `        <w:rFonts w:ascii="${escapeXml(latinFont)}" w:hAnsi="${escapeXml(latinFont)}" w:eastAsia="${escapeXml(latinFont)}" w:cs="${escapeXml(csFont)}"/>`,
    '        <w:color w:val="1E293B"/>',
    `        <w:sz w:val="${bodySizeHp}"/>`,
    `        <w:szCs w:val="${bodySizeHp}"/>`,
    '        <w:lang w:val="en-US" w:bidi="ar-SA"/>',
    '      </w:rPr>',
    '    </w:rPrDefault>',
    '    <w:pPrDefault>',
    '      <w:pPr>',
    `        <w:spacing w:before="0" w:after="40" w:line="${bodyLine}" w:lineRule="auto"/>`,
    '      </w:pPr>',
    '    </w:pPrDefault>',
    '  </w:docDefaults>',
    '  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">',
    '    <w:name w:val="Normal"/>',
    '    <w:qFormat/>',
    '  </w:style>',
    '  <w:style w:type="paragraph" w:styleId="Heading1">',
    '    <w:name w:val="heading 1"/>',
    '    <w:basedOn w:val="Normal"/>',
    '    <w:next w:val="Normal"/>',
    '    <w:qFormat/>',
    '    <w:pPr><w:keepNext/><w:keepLines/></w:pPr>',
    `    <w:rPr><w:b/><w:bCs/><w:color w:val="${accentHex}"/></w:rPr>`,
    '  </w:style>',
    '  <w:style w:type="paragraph" w:styleId="ListBullet">',
    '    <w:name w:val="List Bullet"/>',
    '    <w:basedOn w:val="Normal"/>',
    '  </w:style>',
    '  <w:style w:type="character" w:styleId="Hyperlink">',
    '    <w:name w:val="Hyperlink"/>',
    `    <w:rPr><w:color w:val="${accentHex}"/><w:u w:val="single"/></w:rPr>`,
    '  </w:style>',
    '</w:styles>',
  ].join('\n');
}

export function buildResumeDocxBytes(
  profile: CVProfile,
  theme: DocumentTheme,
  options: DocxExportOptions = {},
): Uint8Array {
  const m = themeMetrics(theme);
  const accentHex = normalizeHex(theme.accentColor, '2557A7');
  const inkHex = '172337';
  const mutedHex = '526074';
  const { latin: latinFont, cs: csFont } = mapFontFamily(theme.fontFamily);

  const pageSize = options.pageSize ?? theme.pageSize ?? 'A4';
  const pageWidthTwips = pageSize === 'Letter' ? 12240 : 11906;
  const pageHeightTwips = pageSize === 'Letter' ? 15840 : 16838;
  const marginTwips = ptToTwips(m.margin);
  const contentWidthTwips = pageWidthTwips - marginTwips * 2;

  const bodySizeHp = ptToHalfPoints(m.size);
  const smallSizeHp = Math.max(15, bodySizeHp - 2);
  const headingSizeHp = ptToHalfPoints(m.sectionTitleSize);
  const nameSizeHp = ptToHalfPoints(m.headerNameSize);
  const headlineSizeHp = ptToHalfPoints(m.headerHeadlineSize);
  const contactSizeHp = ptToHalfPoints(m.headerContactSize);

  const bodyLine = Math.round(m.leading * 240);
  const sectionGapTwips = ptToTwips(m.gap);
  const itemGapTwips = ptToTwips(m.itemGap);
  const bulletGapTwips = ptToTwips(m.bulletGap);

  const rels = new RelationshipRegistry();
  const paragraphs: string[] = [];

  const isClassic = theme.layoutStyle === 'classic';
  const isMinimal = theme.layoutStyle === 'minimal';
  const isTechnical = theme.layoutStyle === 'technical';
  const isExecutive = theme.layoutStyle === 'executive';
  const isCenteredHeader = isClassic || isExecutive;
  const italicSubtitle = isClassic || isExecutive;
  const bulletColorHex = !isClassic && !isMinimal && !isExecutive ? accentHex : '243044';
  const headerAlign: 'center' | undefined = isCenteredHeader ? 'center' : undefined;

  // ── Header ──
  const nameText = plainText(fullName(profile)).trim();
  const headlineText = plainText(headline(profile)).trim();
  const contactPieces = collectHeaderContacts(profile.resumeHeader.data);
  const photo = visiblePhoto(profile);
  const decodedPhoto = photo ? parsePhotoDataUri(photo.source) : null;
  let photoMediaPath: string | null = null;
  let photoRelId: string | null = null;
  if (decodedPhoto) {
    photoMediaPath = `word/media/photo.${decodedPhoto.ext}`;
    photoRelId = rels.addImage(`media/photo.${decodedPhoto.ext}`);
  }

  if (photoRelId && isCenteredHeader) {
    paragraphs.push(
      buildParagraph(buildInlineImageRun(photoRelId, m.photoSize, photo?.shape ?? 'rounded', nameText ? `${nameText} photo` : 'Profile photo'), {
        align: 'center',
        spaceBefore: 0,
        spaceAfter: 100,
        keepNext: true,
      }),
    );
  }

  if (nameText || headlineText || contactPieces.length) {
    const headerStartIdx = paragraphs.length;
    if (nameText) {
      paragraphs.push(
        buildParagraph(
          buildRun(nameText, { bold: true, color: inkHex, sizeHp: nameSizeHp }),
          {
            align: headerAlign,
            spaceBefore: 0,
            spaceAfter: headlineText || contactPieces.length ? 40 : ptToTwips(m.headerPadBottom),
            line: 260,
            keepNext: true,
            bidi: isRTLText(nameText),
            bottomBorder:
              !headlineText && !contactPieces.length
                ? { color: accentHex, sz: isClassic || isExecutive ? 8 : isTechnical ? 12 : 16, space: 6 }
                : undefined,
          },
        ),
      );
    }

    if (headlineText) {
      paragraphs.push(
        buildParagraph(
          buildRun(headlineText, { color: accentHex, sizeHp: headlineSizeHp, bold: false }),
          {
            align: headerAlign,
            spaceBefore: 0,
            spaceAfter: contactPieces.length ? 60 : ptToTwips(m.headerPadBottom),
            line: 260,
            keepNext: true,
            bidi: isRTLText(headlineText),
            bottomBorder: !contactPieces.length
              ? { color: accentHex, sz: isClassic || isExecutive ? 8 : isTechnical ? 12 : 16, space: 6 }
              : undefined,
          },
        ),
      );
    }

    if (contactPieces.length) {
      const contactRtl = contactPieces.some(c => isRTLText(c.label));
      const runs = contactPieces
        .map((c, idx) => {
          const sep = idx > 0 ? buildRun('  ·  ', { color: mutedHex, sizeHp: contactSizeHp, forceLtr: contactRtl }) : '';
          const pieceXml = c.url
            ? buildHyperlinkRun(c.label, c.url, rels, mutedHex, contactSizeHp, contactRtl, false)
            : buildRun(c.label, {
                color: mutedHex,
                sizeHp: contactSizeHp,
                forceLtr: contactRtl && !isRTLText(c.label),
              });
          return sep + pieceXml;
        })
        .join('');
      paragraphs.push(
        buildParagraph(runs, {
          align: headerAlign,
          spaceBefore: isExecutive ? 60 : 0,
          spaceAfter: ptToTwips(m.headerPadBottom),
          line: 260,
          bidi: contactRtl,
          topBorder: isExecutive ? { color: 'CBD5E1', sz: 6, space: 4 } : undefined,
          bottomBorder: isExecutive
            ? { color: 'CBD5E1', sz: 6, space: 4 }
            : { color: accentHex, sz: isClassic ? 8 : isTechnical ? 12 : 16, space: 6 },
        }),
      );
    }
    if (photoRelId && !isCenteredHeader && paragraphs.length > headerStartIdx) {
      const textPars = paragraphs.splice(headerStartIdx);
      const photoColW = ptToTwips(m.photoSize + 14);
      const textColW = Math.max(2000, contentWidthTwips - photoColW);
      const photoPar = buildParagraph(
        buildInlineImageRun(photoRelId, m.photoSize, photo?.shape ?? 'rounded', nameText ? `${nameText} photo` : 'Profile photo'),
        { spaceBefore: 0, spaceAfter: 0 },
      );
      const headerRtl = isRTLText(nameText) || isRTLText(headlineText);
      const noBorders = '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>';
      paragraphs.push(
        `<w:tbl><w:tblPr>${headerRtl ? '<w:bidiVisual/>' : ''}<w:tblW w:w="${contentWidthTwips}" w:type="dxa"/><w:tblBorders>${noBorders}</w:tblBorders><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${photoColW}"/><w:gridCol w:w="${textColW}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${photoColW}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${photoPar}</w:tc><w:tc><w:tcPr><w:tcW w:w="${textColW}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${textPars.join('')}</w:tc></w:tr></w:tbl>`,
      );
    }
  } else if (photoRelId && !isCenteredHeader) {
    paragraphs.push(
      buildParagraph(
        buildInlineImageRun(photoRelId, m.photoSize, photo?.shape ?? 'rounded', 'Profile photo'),
        { spaceBefore: 0, spaceAfter: ptToTwips(m.headerPadBottom) },
      ),
    );
  }

  // Helper emitters
  const pushSectionHeading = (id: SectionId, title: string, forcePageBreak = false) => {
    const cleanTitle = plainText(title).trim();
    if (!cleanTitle) return;
    paragraphs.push(
      buildParagraph(
        buildRun(cleanTitle, { bold: true, caps: true, color: accentHex, sizeHp: headingSizeHp, letterSpacingTwips: 14 }),
        {
          styleId: 'Heading1',
          keepNext: true,
          keepLines: true,
          pageBreakBefore: forcePageBreak || profile.pageLayout?.sections?.[id] === 'new-page',
          spaceBefore: sectionGapTwips,
          spaceAfter: 80,
          line: 240,
          bidi: isRTLText(cleanTitle),
          topBorder: isMinimal ? { color: 'F1F5F9', sz: 18, space: 2 } : undefined,
          bottomBorder: isMinimal
            ? { color: 'F1F5F9', sz: 18, space: 2 }
            : { color: isClassic || isExecutive || isTechnical ? accentHex : 'CBD5E1', sz: 6, space: 3 },
          shadingFill: isMinimal ? 'F1F5F9' : undefined,
        },
      ),
    );
  };

  const pushTitleDateLine = (
    titleText: string,
    dateText: string,
    opts: { spaceBefore: number; keepNext?: boolean; pageBreakBefore?: boolean; inlineSubtitle?: string; inlineSubtitleXml?: string },
  ) => {
    const t = plainText(titleText).trim();
    const sub = opts.inlineSubtitle ? plainText(opts.inlineSubtitle).trim() : '';
    const d = plainText(dateText).trim();
    const bidi = isRTLText(t) || isRTLText(sub) || isRTLText(d);
    const runs =
      buildRun(t, { bold: true, color: inkHex, sizeHp: bodySizeHp }) +
      (opts.inlineSubtitleXml
        ? buildRun(' — ', { color: mutedHex, sizeHp: smallSizeHp }) + opts.inlineSubtitleXml
        : sub ? buildRun(` — ${sub}`, { color: mutedHex, sizeHp: smallSizeHp }) : '') +
      (d
        ? `<w:r><w:tab/></w:r>${buildRun(d, {
            color: mutedHex,
            sizeHp: smallSizeHp,
            forceLtr: bidi && !isRTLText(d),
          })}`
        : '');
    paragraphs.push(
      buildParagraph(runs, {
        keepLines: true,
        keepNext: opts.keepNext,
        pageBreakBefore: opts.pageBreakBefore,
        rightTabPos: d ? contentWidthTwips : undefined,
        spaceBefore: opts.spaceBefore,
        spaceAfter: 20,
        line: bodyLine,
        bidi,
      }),
    );
  };

  const pushBullet = (text: string, keepNext = false) => {
    const clean = plainText(text).trim();
    if (!clean) return;
    const bidi = isRTLText(clean);
    const inner =
      buildRun('•', { color: bulletColorHex, sizeHp: bodySizeHp }) +
      '<w:r><w:tab/></w:r>' +
      buildRun(clean, { sizeHp: bodySizeHp });
    paragraphs.push(
      buildParagraph(inner, {
        styleId: 'ListBullet',
        keepLines: true,
        keepNext,
        hangingIndent: { left: 360, hanging: 180 },
        spaceBefore: 0,
        spaceAfter: bulletGapTwips,
        line: bodyLine,
        bidi,
      }),
    );
  };

  const pushBodyText = (text: string, spaceAfter = 40, keepNext = false) => {
    const clean = plainText(text).trim();
    if (!clean) return;
    const lines = clean.split(/\n+/).map(x => x.trim()).filter(Boolean);
    lines.forEach(part => {
      paragraphs.push(
        buildParagraph(buildRun(part, { sizeHp: bodySizeHp }), {
          keepLines: true,
          keepNext,
          spaceBefore: 0,
          spaceAfter,
          line: bodyLine,
          bidi: isRTLText(part),
        }),
      );
    });
  };

  // ── Ordered Sections ──
  const sectionOrder = orderedSections(profile).map(s => s.id).filter(id => id !== 'personal');

  for (const secId of sectionOrder) {
    if (secId === 'summary') {
      if (profile.summary.hidden) continue;
      const text = plainText(profile.summary.data).trim();
      if (!text) continue;
      pushSectionHeading('summary', profile.summary.title || 'Profile');
      pushBodyText(text, 40);
      continue;
    }

    if (secId === 'experience') {
      if (profile.experience.hidden) continue;
      const entries = profile.experience.data.filter(
        e =>
          !e.hidden &&
          (
          plainText(e.roleTitle).trim() ||
          plainText(e.companyName).trim() ||
          plainText(e.description || '').trim() ||
          e.bullets.some(b => plainText(b.text).trim())),
      );
      if (!entries.length) continue;
      const firstExpBreak = profile.pageLayout?.entries?.[entries[0].id] === 'new-page';
      pushSectionHeading('experience', profile.experience.title || 'Experience', firstExpBreak);
      entries.forEach((e, idx) => {
        const date = formatDateRange(e.startDate, e.endDate);
        const subtitle = [e.companyName, e.city].map(x => plainText(x || '').trim()).filter(Boolean).join(' · ');
        const desc = plainText(e.description || '').trim();
        const bullets = e.bullets.map(b => plainText(b.text).trim()).filter(Boolean);
        const mode = profile.pageLayout?.entries?.[e.id];
        const pageBreak = idx > 0 && mode === 'new-page';
        const together = mode === 'together';

        const inlineExpSub = isTechnical && subtitle && plainText(e.roleTitle).trim() ? subtitle : undefined;
        pushTitleDateLine(e.roleTitle || subtitle, date, {
          spaceBefore: idx === 0 ? 40 : itemGapTwips,
          keepNext: Boolean((!inlineExpSub && subtitle) || desc || bullets.length),
          pageBreakBefore: pageBreak,
          inlineSubtitle: inlineExpSub,
        });
        if (subtitle && e.roleTitle.trim() && !inlineExpSub) {
          paragraphs.push(
            buildParagraph(buildRun(subtitle, { italic: italicSubtitle, color: mutedHex, sizeHp: smallSizeHp }), {
              keepNext: Boolean(desc || bullets.length),
              spaceBefore: 0,
              spaceAfter: 30,
              line: bodyLine,
              bidi: isRTLText(subtitle),
            }),
          );
        }
        if (desc) pushBodyText(desc, 30, together && bullets.length > 0);
        bullets.forEach((b, bi) => pushBullet(b, together && bi < bullets.length - 1));
      });
      continue;
    }

    if (secId === 'projects') {
      if (profile.projects.hidden) continue;
      const entries = profile.projects.data.filter(
        e =>
          !e.hidden &&
          (
          plainText(e.name).trim() ||
          plainText(e.role || '').trim() ||
          plainText(e.url || '').trim() ||
          e.bullets.some(b => plainText(b.text).trim())),
      );
      if (!entries.length) continue;
      const firstProjBreak = profile.pageLayout?.entries?.[entries[0].id] === 'new-page';
      pushSectionHeading('projects', profile.projects.title || 'Projects', firstProjBreak);
      entries.forEach((e, idx) => {
        const name = plainText(e.name || '').trim();
        const role = plainText(e.role || '').trim();
        const rawUrl = plainText(e.url || '').trim();
        const normalizedUrl = rawUrl ? normalizeExternalUrl(rawUrl, 'web') : null;
        const bullets = e.bullets.map(b => plainText(b.text).trim()).filter(Boolean);
        const mode = profile.pageLayout?.entries?.[e.id];
        const pageBreak = idx > 0 && mode === 'new-page';
        const together = mode === 'together';
        const subRole = name ? role : '';

        const subBidi = isRTLText(subRole);
        const subParts: string[] = [];
        if (subRole) subParts.push(buildRun(subRole, { italic: italicSubtitle, color: mutedHex, sizeHp: smallSizeHp }));
        if (subRole && rawUrl) subParts.push(buildRun(' · ', { color: mutedHex, sizeHp: smallSizeHp, forceLtr: subBidi }));
        if (rawUrl) {
          subParts.push(
            normalizedUrl
              ? buildHyperlinkRun(rawUrl, normalizedUrl, rels, mutedHex, smallSizeHp, subBidi, false)
              : buildRun(rawUrl, { color: mutedHex, sizeHp: smallSizeHp, forceLtr: subBidi }),
          );
        }
        const inlineProjXml = isTechnical && name && subParts.length ? subParts.join('') : undefined;
        pushTitleDateLine(name || role, '', {
          spaceBefore: idx === 0 ? 40 : itemGapTwips,
          keepNext: Boolean((!inlineProjXml && subParts.length) || bullets.length),
          pageBreakBefore: pageBreak,
          inlineSubtitleXml: inlineProjXml,
        });
        if (subParts.length && !inlineProjXml) {
          paragraphs.push(
            buildParagraph(subParts.join(''), {
              keepNext: Boolean(bullets.length),
              spaceBefore: 0,
              spaceAfter: 30,
              line: bodyLine,
              bidi: subBidi,
            }),
          );
        }
        bullets.forEach((b, bi) => pushBullet(b, together && bi < bullets.length - 1));
      });
      continue;
    }

    if (secId === 'skills') {
      if (profile.skills.hidden) continue;
      const groups = orderedSkillGroups(profile.skills.data);
      if (!groups.length) continue;
      pushSectionHeading('skills', profile.skills.title || 'Skills');
      groups.forEach((group, idx) => {
        const label = `${group.title}: `;
        const list = group.items
          .map(s => { const lvl = plainText(s.level || '').trim(); return lvl ? `${plainText(s.name)} — ${lvl}` : plainText(s.name); })
          .join(' · ');
        const bidi = isRTLText(label) || isRTLText(list);
        paragraphs.push(
          buildParagraph(
            buildRun(label, { bold: true, color: inkHex, sizeHp: bodySizeHp }) +
              buildRun(list, { sizeHp: bodySizeHp }),
            {
              spaceBefore: idx === 0 ? 40 : 20,
              spaceAfter: 30,
              line: bodyLine,
              bidi,
            },
          ),
        );
      });
      continue;
    }

    if (secId === 'education') {
      if (profile.education.hidden) continue;
      const entries = profile.education.data.filter(
        e => !e.hidden && (plainText(e.degree).trim() || plainText(e.institution).trim()),
      );
      if (!entries.length) continue;
      const firstEduBreak = profile.pageLayout?.entries?.[entries[0].id] === 'new-page';
      pushSectionHeading('education', profile.education.title || 'Education', firstEduBreak);
      entries.forEach((e, idx) => {
        const date =
          formatDateRange(e.startDate, e.endDate) || (e.graduationDate || '').trim();
        const subtitle = [e.institution, e.city].map(x => plainText(x || '').trim()).filter(Boolean).join(' · ');
        const details = [
          plainText(e.description || '').trim(),
          e.gpa ? `GPA: ${plainText(e.gpa).trim()}` : '',
          e.honors?.map(h => plainText(h).trim()).filter(Boolean).join(' · ') || '',
        ].filter(Boolean);
        const pageBreak = idx > 0 && profile.pageLayout?.entries?.[e.id] === 'new-page';

        const inlineEduSub = isTechnical && subtitle && plainText(e.degree).trim() ? subtitle : undefined;
        pushTitleDateLine(e.degree || subtitle, date, {
          spaceBefore: idx === 0 ? 40 : itemGapTwips,
          keepNext: Boolean((!inlineEduSub && subtitle) || details.length),
          pageBreakBefore: pageBreak,
          inlineSubtitle: inlineEduSub,
        });
        if (subtitle && plainText(e.degree).trim() && !inlineEduSub) {
          paragraphs.push(
            buildParagraph(buildRun(subtitle, { italic: italicSubtitle, color: mutedHex, sizeHp: smallSizeHp }), {
              keepNext: Boolean(details.length),
              spaceBefore: 0,
              spaceAfter: 20,
              line: bodyLine,
              bidi: isRTLText(subtitle),
            }),
          );
        }
        details.forEach(d => pushBodyText(d, 20));
      });
      continue;
    }

    if (secId === 'certifications') {
      if (profile.certifications.hidden) continue;
      const entries = profile.certifications.data.filter(c => !c.hidden && plainText(c.name).trim());
      if (!entries.length) continue;
      const firstCertBreak = profile.pageLayout?.entries?.[entries[0].id] === 'new-page';
      pushSectionHeading('certifications', profile.certifications.title || 'Certifications', firstCertBreak);
      if (theme.compactCertifications) {
        const halfW = Math.floor(contentWidthTwips / 2);
        const rowsXml: string[] = [];
        for (let i = 0; i < entries.length; i += 2) {
          const pair = entries.slice(i, i + 2);
          const cellsXml = pair.map(c => {
            const name = plainText(c.name).trim();
            const issuer = plainText(c.issuer || '').trim();
            const date = (c.date || '').trim();
            const meta = [issuer, date].filter(Boolean).join(' · ');
            const cellPars = [
              buildParagraph(buildRun(name, { bold: true, color: inkHex, sizeHp: Math.max(16, bodySizeHp - 1) }), {
                keepLines: true,
                keepNext: Boolean(meta),
                spaceBefore: 20,
                spaceAfter: meta ? 10 : 40,
                line: bodyLine,
                bidi: isRTLText(name),
              }),
              ...(meta
                ? [
                    buildParagraph(buildRun(meta, { color: mutedHex, sizeHp: smallSizeHp }), {
                      keepLines: true,
                      spaceBefore: 0,
                      spaceAfter: 40,
                      line: bodyLine,
                      bidi: isRTLText(meta),
                    }),
                  ]
                : []),
            ].join('');
            return `<w:tc><w:tcPr><w:tcW w:w="${halfW}" w:type="dxa"/></w:tcPr>${cellPars}</w:tc>`;
          });
          if (pair.length === 1) {
            cellsXml.push(`<w:tc><w:tcPr><w:tcW w:w="${halfW}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`);
          }
          rowsXml.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${cellsXml.join('')}</w:tr>`);
        }
        const certRtl = entries.some(c => isRTLText(c.name) || isRTLText(c.issuer || ''));
        paragraphs.push(
          `<w:tbl><w:tblPr>${certRtl ? '<w:bidiVisual/>' : ''}<w:tblW w:w="${contentWidthTwips}" w:type="dxa"/><w:tblBorders><w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/></w:tblBorders><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${halfW}"/><w:gridCol w:w="${halfW}"/></w:tblGrid>${rowsXml.join('')}</w:tbl>`,
        );
      } else {
        entries.forEach((c, idx) => {
          const name = plainText(c.name).trim();
          const issuer = plainText(c.issuer || '').trim();
          const date = (c.date || '').trim();
          const pageBreak = idx > 0 && profile.pageLayout?.entries?.[c.id] === 'new-page';
          pushTitleDateLine(name, date, {
            spaceBefore: idx === 0 ? 40 : Math.max(40, Math.round(itemGapTwips * 0.75)),
            keepNext: Boolean(issuer),
            pageBreakBefore: pageBreak,
          });
          if (issuer) {
            paragraphs.push(
              buildParagraph(buildRun(issuer, { italic: italicSubtitle, color: mutedHex, sizeHp: smallSizeHp }), {
                keepLines: true,
                spaceBefore: 0,
                spaceAfter: 20,
                line: bodyLine,
                bidi: isRTLText(issuer),
              }),
            );
          }
        });
      }
      continue;
    }

    if (secId.startsWith('custom:')) {
      const customId = secId.slice('custom:'.length);
      const custom: CustomResumeSection | undefined = (profile.customSections ?? []).find(c => c.id === customId);
      if (!custom || custom.hidden) continue;
      if (custom.title.trim().toLowerCase() === 'imported details') continue;

      const kind = custom.kind ?? 'text';
      if (kind === 'experience') {
        const entries = (custom.entries ?? []).filter(
          e => !e.hidden && (plainText(e.title).trim() || plainText(e.organization).trim() || plainText(e.description).trim()),
        );
        if (!entries.length) continue;
        const firstCustomBreak = profile.pageLayout?.entries?.[entries[0].id] === 'new-page';
        pushSectionHeading(secId, custom.title.trim() || 'Additional information', firstCustomBreak);
        entries.forEach((e, idx) => {
          const date = formatDateRange(e.startDate, e.endDate);
          const subtitle = [e.organization, e.location].map(x => plainText(x || '').trim()).filter(Boolean).join(' · ');
          const desc = plainText(e.description || '').trim();
          pushTitleDateLine(e.title || subtitle, date, {
            spaceBefore: idx === 0 ? 40 : itemGapTwips,
            keepNext: Boolean(subtitle || desc),
            pageBreakBefore: idx > 0 && profile.pageLayout?.entries?.[e.id] === 'new-page',
          });
          if (subtitle && e.title.trim()) {
            paragraphs.push(
              buildParagraph(buildRun(subtitle, { italic: italicSubtitle, color: mutedHex, sizeHp: smallSizeHp }), {
                keepNext: Boolean(desc),
                spaceBefore: 0,
                spaceAfter: 20,
                line: bodyLine,
                bidi: isRTLText(subtitle),
              }),
            );
          }
          if (desc) pushBodyText(desc, 30);
        });
      } else if (kind === 'list') {
        const items = custom.paragraphs.map(p => plainText(p).trim()).filter(Boolean);
        if (!items.length) continue;
        pushSectionHeading(secId, custom.title.trim() || 'Additional information');
        items.forEach(item => pushBullet(item));
      } else if (kind === 'skills') {
        const items = custom.paragraphs.map(p => plainText(p).trim()).filter(Boolean);
        if (!items.length) continue;
        pushSectionHeading(secId, custom.title.trim() || 'Additional information');
        pushBodyText(items.join(' · '), 40);
      } else {
        const items = custom.paragraphs.map(p => plainText(p).trim()).filter(Boolean);
        if (!items.length) continue;
        pushSectionHeading(secId, custom.title.trim() || 'Additional information');
        items.forEach(p => pushBodyText(p, 40));
      }
    }
  }

  // Ensure document body always has at least one paragraph before sectPr
  if (!paragraphs.length) {
    paragraphs.push('<w:p/>');
  }

  const sectPr = [
    '<w:sectPr>',
    `  <w:pgSz w:w="${pageWidthTwips}" w:h="${pageHeightTwips}"/>`,
    `  <w:pgMar w:top="${marginTwips}" w:right="${marginTwips}" w:bottom="${marginTwips}" w:left="${marginTwips}" w:header="720" w:footer="720" w:gutter="0"/>`,
    '</w:sectPr>',
  ].join('\n');

  const documentXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">',
    '  <w:body>',
    ...paragraphs.map(p => `    ${p}`),
    `    ${sectPr}`,
    '  </w:body>',
    '</w:document>',
  ].join('\n');

  const stylesXml = buildStylesXml(latinFont, csFont, bodySizeHp, bodyLine, accentHex);

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(buildContentTypesXml(decodedPhoto?.ext)),
    '_rels/.rels': strToU8(buildRootRelsXml()),
    'word/_rels/document.xml.rels': strToU8(rels.toRelsXml()),
    'word/styles.xml': strToU8(stylesXml),
    'word/document.xml': strToU8(documentXml),
  };
  if (decodedPhoto && photoMediaPath) {
    files[photoMediaPath] = decodedPhoto.bytes;
  }
  return zipSync(files);
}

export function buildResumeDocxBlob(
  profile: CVProfile,
  theme: DocumentTheme,
  options: DocxExportOptions = {},
): Blob {
  const bytes = buildResumeDocxBytes(profile, theme, options);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
