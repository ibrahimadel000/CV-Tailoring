# Batch 08 validation

## Scope
Four existing files modified: EditorControls.tsx, SectionEditor.tsx, CustomSectionEditor.tsx and index.css. No schema/store/PDF renderer/pipeline/dependency/package/lockfile/environment/AI-service changes. Baseline restored byte-for-byte from the delivered Batch 07 archive before changes; manifest baseline/payload hashes checked mechanically. Installer/rollback reused unchanged.

## Passed locally
- TypeScript + Vite production build. Production bundle loads its local PDF worker and exports Alex sample as two pages without failed requests/page errors.
- Quiet filled inputs, shared labels/hints, grouped personal/contact/optional information, responsive field grids, and native autofill metadata.
- Email error absent before first blur; shown after blur with aria-invalid and linked aria-describedby; clears on correction.
- Visibility switches preserve text; keyboard Space operates switches. Switch label targets at least 44px high and do not overlap the text input.
- Representative input checks: height 52px, text 16px, text contrast 12.81:1, resting bottom boundary 3.14:1, placeholder 4.52:1. This is not a full WCAG audit.
- Optional detail add focuses its input. Optional role overview stays out of the way when empty, receives focus when added, preserves content after Done/Edit, and resets its empty UI after reopening without deleting data.
- Ongoing end-date disabled/enabled behavior and in-session typed-date restoration tested for built-in and custom experience entries.
- Textareas show ordinary achievement content without inner clipping, grow on content/width changes, and bound auto-growth at 480px with native scrolling for longer content.
- New achievement receives focus; removing it focuses an adjacent field. Enter adds skills; IME composition Enter does not submit. Shared custom forms continue editing existing typed sections.
- Keyboard focus, reduced-motion switch/knob transitions and forced-color native switch fallback tested. Locked sections remain non-editable.
- JSON backup/reload preserves optional text, hidden flags and existing page-layout preferences.
- Existing regression: cached preview/export PDF bytes match; Alex 2 pages, longer summary 4, restored 2; heading edit hotspots, selection, zoom/Fit, design, focus preview, inspection, typed legacy imports, unsupported-script fallback, mobile live edits and autosave/reload.
- Responsive checks at 320x740, 390x844, 1024x768, 1280x720, 1440x960 and 1920x1080: no page-level viewport overflow. Grid switches to one column on narrow phones and constrained editor containers.
- Parse/render failure and retry recovery checks still pass, with no unhandled page errors.
- Independent frozen-HTML visual audit: no console errors, failed resources, exceptions, overlay intersections or viewport overflow; intentionally clipped screen-reader-only instructions are excluded.

## Visual inspection
Reviewed filled/blank personal forms, focus state, delayed email error, narrow 320px and 390px mobile fields, job/date groups, growing achievement fields, mobile achievements, custom experience editor and design controls. Final personal snapshot also inspected via the independent capture helper. No new decorative images or redundant navigation added.

## Limits
Linux Chromium only; no physical-device, cross-browser, screen-reader certification, full accessibility audit or Windows PowerShell execution. Ongoing-date memory is local to the open entry, not a new persisted data field. Native browser autofill availability depends on the browser. No rich-text/date picker, photo upload, AI Tailor or additional personal-data fields. Existing Latin-PDF limitation and earlier chunk/eval warnings remain.
