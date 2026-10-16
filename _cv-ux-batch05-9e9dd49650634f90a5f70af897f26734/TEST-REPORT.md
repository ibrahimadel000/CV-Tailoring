# Batch 05 validation

## Scope
Six modified source files and one new shared EditorControls.tsx. No package, lockfile, environment, store or AI-service edits. Optional kind/entries schema fields extend custom sections; missing kind remains legacy text. Existing paragraph arrays are not migrated or discarded.

## Passed locally
- TypeScript + Vite production build.
- Batch 04 JSON import; legacy custom paragraph content and order preserved.
- Inline show/hide flags affect preview and PDF without deleting stored text; adding an optional link focuses its input and removes its add chip.
- Existing entries collapsed; opening an entry closes the previous one in that section. New entries open; Done collapses to an editable summary; cancel deletion keeps data.
- Courses preset creates structured entries with dates, organization, description and entry reordering.
- Achievements renders semantic bullet lists; Languages chips support comma/Enter additions and duplicate filtering; text uses blank-line-separated paragraphs.
- Custom format picker, Cancel/Escape, quick additions, empty section exclusion, deletion confirmation.
- Mouse, touch-enabled Chromium CDP gestures and keyboard section reordering; Personal details remains first.
- New typed data survives JSON export, import into a separate browser context and re-export; autosave/reload preserves content and visibility.
- Design live preview, actual blob-backed PDF inspection and PDF download.
- PDF text extraction contains structured course entries, list items, language items and legacy/new paragraphs. Hidden phone excluded. All three test PDF pages visually inspected.
- PDF unsupported-character guard covers new typed entry fields, including Arabic text.
- Layout checks at 320x740, 390x844, 1024x768, 1280x720, 1440x960 and 1920x1080; no page-level horizontal/vertical overflow or unhandled page errors in the automated checks.
- Independent frozen-HTML visual capture checks viewport layout and overlay intersections; screen-reader-only clipped instructions are intentional.

## Visual review
Inspected desktop input, collapsed overview, quick-add format picker, structured entry editor and footer, mobile input/picker/editor/preview, design drawer, responsive widths and all PDF pages. Narrow 320px fields were changed to one column after visual review to avoid uneven label/visibility wrapping.

## Limits
Linux Chromium testing, not a Windows PowerShell execution, physical-device verification, cross-browser certification or full accessibility audit. Installer and rollback scripts reused unchanged; manifest baseline and payload hashes checked mechanically. No claims about ATS outcomes. Existing eval/large-chunk warnings remain. No rich-text formatting, structured date picker, global undo/redo or AI Tailor implemented.
