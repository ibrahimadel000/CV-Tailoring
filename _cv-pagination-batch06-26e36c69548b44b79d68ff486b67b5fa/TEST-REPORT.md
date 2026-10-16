# Batch 06 validation

## Scope
Four modified source files; two new files: PaginatedPreview.tsx and pdfPipeline.tsx. No dependencies, package, lockfile, environment, store/schema or AI-service edits. Guarded installer and rollback reused unchanged from Batch 05.

## Passed locally
- TypeScript/Vite production build; production preview loads bundled PDF.js worker locally with no failed requests or page errors.
- Alex sample: two actual A4 pages; labels and persistent count match PDF numPages. Empty resume: one page.
- Longer summary increases count to four; restoring text returns to two. Rapid edits resolve to latest content; stale preview explicitly marked updating.
- Exported PDF byte hash equals the shared live-preview PDF blob. Labels outside page are excluded from downloaded PDF text.
- Actual PDF text coordinates drive heading edit hotspots and section following. Text selection, zoom, Fit, focus preview and PDF inspection tested.
- Design/template/font/color changes update PDF-backed preview. Existing typed custom sections and legacy text imported from Batch 05 still render.
- Autosave/reload, mobile edit/preview switching and page breaks verified.
- Unsupported-script safe HTML fallback preserves Arabic text without an inaccurate page count; Latin recovery tested.
- Injected PDF parsing failure shows error without fake count; Retry recovers. Injected canvas rendering failure shows per-page Retry and recovers. No unhandled page errors.
- Responsive layout at 320x740, 390x844, 1024x768, 1280x720, 1440x960 and 1920x1080; automated checks found no page-level viewport overflow.
- Independent frozen-HTML visual capture: no console errors, exceptions, failed resources, overlay intersections or viewport overflow. Intentionally clipped screen-reader-only instructions excluded.
- Visually reviewed desktop page break, page 2, both complete live PDF page canvases, mobile page breaks, narrow mobile, design, focus, empty, unsupported script and error/recovery states.

## Limits
Linux Chromium only, not Windows PowerShell execution, physical-device testing, cross-browser certification or full accessibility audit. Payload and baseline hashes mechanically verified; installer/rollback not executed on Windows here. Font support remains Latin-only. Existing large renderer-chunk and eval warnings remain. No ATS outcome claims or AI Tailor implementation.
