// Narrow adapter types for the MIT geometry module; source data remains in CVProfile.
export type RawTextItem = { str: string; transform: number[]; width: number; height: number; fontRef: string };
export type RawPage = { pageNumber: number; width: number; height: number; items: readonly RawTextItem[] };
export type RawExtraction = { pages: readonly RawPage[] };
type Box = { x: number; y: number; width: number; height: number };
export type TextSpan = Box & { text: string; fontRef: string; fontSize: number; streamIndex: number };
export type TextLine = Box & { page: number; text: string; spans: readonly TextSpan[]; fontSize: number; fontRef: string | null; meanStreamIndex: number };
export type ColumnGutter = { x: number; width: number; coverage: number; splitRatio: number };
export type PageGeometry = { pageNumber: number; width: number; height: number; lines: readonly TextLine[]; inversionRatio: number; gutter: ColumnGutter | null; margins: {top: number;right: number;bottom: number;left: number}; textAreaRatio: number };
export type ExtractedDocument = { pages: readonly PageGeometry[]; lines: readonly TextLine[]; fullText: string; charCount: number; wordCount: number; modalFontSize: number | null; modalFontRef: string | null; distinctFontRefs: number };
