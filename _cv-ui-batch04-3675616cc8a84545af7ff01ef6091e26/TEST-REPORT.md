# Batch 04 validation

## Scope
Five modified source files. No schema, store, package or dependency edits. Baseline hashes of Batch 03 were verified before packaging. Installer/rollback scripts are reused unchanged.

## Passed
- TypeScript + Vite production build (2105 modules).
- Exactly one accordion editor and no section rail, duplicate editor tabs or step footer in the rendered DOM.
- Two-pane desktop layout; editor width 633.6 px at 1440 px (formerly 380 px).
- One section expands at a time; preview links open that same accordion.
- Main personal fields, secondary links and display flags work; hidden phone removed from preview and PDF.
- Filled experience cards start collapsed; newly added role opens for editing and saves.
- Drag-and-drop by mouse and touch; keyboard reorder; Escape cancellation; personal details stay first.
- Quick-add sections, renaming, multiple paragraphs, deletion confirmation/cancellation.
- More menu: outside click and Escape dismiss, JSON backup downloads and preserves custom content/flags.
- Previous Batch 03 JSON imports without a migration; original records are not overwritten.
- Design drawer: template/accent changes update live preview; closing restores editor scroll/context.
- Zoom, fit, preview focus and actual blob-backed PDF viewer.
- PDF download: custom paragraphs and updated role preserved; arranged custom section precedes Profile; phone visibility honored; two rendered pages visually checked.
- Autosave/reload preserves fields and ordering.
- Mobile 390x844: touch-enabled Chromium with CDP touch gestures, additions, editing, design, deletion and reload persistence.
- Empty library and new-resume recovery.
- No unhandled browser page errors during automated checks.

## Visual review
Inspected overview, wide personal input, temporary design drawer, More menu, mobile input/preview/design/quick-add/custom states and both PDF pages. Additional responsive captures checked at 1920x1080, 1440x960, 1280x720, 1024x768 and 390x844.
Independent HTML capture helper: no viewport overflow, console errors, failed resources or unexpected overlay intersections. Intentionally clipped screen-reader-only instructions are not visible layout overflow.

## Limits
Local Linux Chromium testing, not a Windows installer execution, physical-device testing, cross-browser certification or a full accessibility audit. Existing vm-browserify eval and large PDF renderer chunk warnings remain. Arabic PDF font/shaping support and AI Tailor are not implemented by this batch.
