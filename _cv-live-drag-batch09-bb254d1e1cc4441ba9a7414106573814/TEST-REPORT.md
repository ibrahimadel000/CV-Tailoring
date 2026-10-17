# Batch 09 verification

## Scope
Five existing source files changed. Store/schema, PDF renderer/pipeline, packages, lockfile, .env and AI services are unchanged. Persistence hook change is message text only; saving/loading behavior is unchanged. JSON user export/import handlers and controls removed; internal serialization remains.

## Automated checks — Linux Chromium
- Production build passes. Existing eval/large-bundle warnings remain.
- Real live card follows pointer movement. Same-size insertion slot and keyed sibling rearrangement. Closed and expanded cards tested. Open card/form DOM identity preserved; text and local entry editing state survive reorder.
- Pointer sorting down/up, keyboard Up/Down/Home/End, saved order after reload, personal-details first, click without moving, Escape and outside-drop cancellation.
- Touch gesture sorting in Chromium CDP, ordinary native form scrolling without sorting, tall open-section drop, touchCancel, resize cancellation, edge scrolling (672px during test), unique input IDs, reduced-motion keyboard sorting.
- JSON actions absent in blank, library, main and export flows; no hidden file input. PDF download works.
- Simulated local-save failure: correct error without removed-backup instructions; retry saves current edits; reload retains them. Library duplicate/delete/new-resume flows pass.
- Alex sample two A4 pages; long summary grows to four and returns to two. Preview/export cached PDF hashes match byte for byte. Live page labels, updating state, selectable text, Fit/zoom, design, focus preview, PDF modal and heading-to-editor controls remain functional.
- Existing typed-section fixture injected directly into test store (not via a hidden user import feature): structured custom sections/page layout still work. Non-Latin safe fallback remains explicit, without a fake page count.
- Mobile live preview/edit/reload pass. Widths 320,390,1024,1280,1440,1920 have no horizontal document overflow.
- PDF parse/render failure and retries recover without unhandled page errors.
- Built production bundle loads local PDF worker, renders sample two pages and exports PDF; no failed requests/page errors.

## Visual inspection
Individually reviewed normal desktop/mobile lists, desktop/mobile live drag, expanded live form and independent frozen-HTML capture. Intentional overlap of a lifted card over nearby rows is the drag affordance; no unintended header/preview overlap or viewport overflow. Independent helper reports no failed resources, exceptions, overlay intersections or viewport overflow in the resting state; intentional screen-reader-only text clipping excluded. No decorative imagery added.

## Limitations
Linux Chromium and emulated touch only. Not a physical-device, Safari/Firefox, full accessibility/screen-reader or Windows PowerShell execution certification. Existing Latin-only PDF font limitation remains. Open, viewport-taller cards are clipped to the visible editor area during drag rather than collapsed. This release reorders sections, not entries. No cloud sync or new manual data-backup feature. Clearing browser storage can remove local resumes.
