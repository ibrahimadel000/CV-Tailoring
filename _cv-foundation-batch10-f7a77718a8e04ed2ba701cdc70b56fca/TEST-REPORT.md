# Batch 10 verification

## Scope
Seven existing source files + one new editor anchoring hook. No dependencies, lockfile, CSS, .env, AI service, PDF renderer/pipeline or JSON user controls changed. Optional per-document documentTheme schema added; legacy shared appearance migrates into each old resume before the existing autosave writes. Initial new/demo design uses explicit defaults.

## Checks passed — Linux Chromium
- Store isolation: new default, switching documents, clone design independence, deleting active document, save/reload, legacy shared-theme migration with content unchanged, migrated documents remaining independent. Invalid per-document theme fails closed and does not overwrite invalid stored data. Legacy theme values are individually validated.
- Explicit empty headline remains empty after save/reload. Legacy undefined field falls back to old headline in editor and output; visibility toggle works. Exported PDF text checked: old headline absent, actual experience title retained once.
- Desktop and mobile section switches retain a visible clicked header. Entry switch retains visible heading. Done restores visible header focus and outer page remains at scrollY=0. No stale timers for click/Done anchoring.
- Adding Languages immediately has zero stale sibling animations on desktop/mobile. Previously reproducible overlap no longer occurs.
- Pointer tracks actual keyed card, same-size insertion slot, keyboard Up/Down/Home/End, persisted order, Escape/outside/touchCancel/resize cancellation. Expanded card and form DOM identity/state retained. Native touch scrolling outside handle; edge scroll 679px in this run. Reduced-motion sorting and unique form IDs.
- Save failure/retry/reload, duplicate/delete/new resume pass. JSON UI remains absent; PDF download remains available.
- Sample 2 A4 pages, long summary grows to 4 then returns to 2; byte-identical preview/export cache. Page labels, stale-update state, selectable text, Fit/zoom, design, focus preview, PDF modal and preview-to-editor navigation. Typed custom sections and page layout fixture pass; non-Latin fallback explicit without fake pagination.
- Simulated PDF parse/canvas failures recover with retry. Production build passes; local PDF worker loads; export works without failed requests/page errors. Existing eval/bundle-size build warnings remain.
- Widths 320/390/1024/1280/1440/1920 have no horizontal document overflow.

## Visual QA
Individually inspected desktop added-section state, Done/list state, mobile personal fields and added Languages, desktop/mobile live drag, expanded drag and design panel, plus independent frozen-HTML helper capture. Lifted card overlaps are intentional drag affordances; normal editing has no accidental overlay. Capture helper has no failed resources, exceptions, overlay intersections or viewport overflow; its one clipping diagnostic is intentional sr-only help. No decorative imagery introduced.

## Caveats
Early dev test runs against a pre-existing HMR server imported a second store module through unversioned test URLs; direct-store-injection checks failed. All listed final checks reran against a clean dedicated server and passed. This was a test harness/server mismatch, not a silently ignored failing release check.
Linux Chromium/emulated touch, not physical devices, Safari/Firefox, full screen-reader certification or executed Windows PowerShell. Installer reviewed/hash-validated, but must still run on the user's Windows environment. No claim of cloud backup, complete new field set, Arabic PDF export or AI Tailor readiness. Historical independent themes cannot be recovered from old releases that stored only one global theme.
