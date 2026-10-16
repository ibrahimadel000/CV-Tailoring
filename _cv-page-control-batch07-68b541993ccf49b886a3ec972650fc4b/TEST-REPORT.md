# Batch 07 validation

## Scope
Nine modified source files and one new PageLayoutControls.tsx. Optional CVProfile.pageLayout with validated per-section/per-entry settings. No dependency/package/lockfile/environment/store/AI-service edits. Installer/rollback reused unchanged from Batch 06. Payload and baseline hashes mechanically verified.

## Pagination implementation
A naturally wrapped measurement pass reads real renderer layout boxes (including fragments across pages), followed by a final pass. Automatic groups entries no taller than 60% of usable A4 height. Explicit together/new-page groups an entry only if measured to fit a full page. Oversized content remains wrappable. Header/first-content groups and normal individual bullets are kept intact if they fit. Missing measurement metadata safely degrades to natural wrapping, not guessed unbreakable heights. Layout metadata uses the installed react-pdf version; future dependency upgrades should rerun pagination tests.

## Passed locally
- TypeScript/Vite production build; production PDF worker loads locally; Alex sample remains two pages and PDF export succeeds.
- Constructed a real split fixture: without smart grouping, first and last job bullets fall on different pages; with Automatic, all four bullets and heading move together to page 2.
- A 14-bullet page-sized job flows over two pages in Automatic, but Keep together moves its complete content to page 2. A 45-bullet oversized job spans three pages safely, with each numbered bullet present once; ordinary bullets remain together.
- A single enormous bullet spans three pages safely, including start/end markers. Extracted text bounds checked for all eight generated test pages; no clipping outside page margins. All eight pages visually inspected individually.
- Entry manual break, section manual break, first-entry/section break combination, remove/reset, collapsed indicators and stable control expansion tested.
- Page preferences survive JSON backup, import, autosave/reload and profile duplication; invalid enum rejected. Legacy Batch 05 typed/paragraph data still imports and renders.
- Structured custom experience controls tested. Reordering retains rules by entry ID; empty section breaks do not create blank pages.
- Sans/medium/balanced, serif/large/relaxed and mono/small/compact combinations preserve content with text inside page bounds.
- Final regression: byte-identical cached preview/export blob; sample 2 pages, long summary 4, restored 2; actual-heading edit hotspots; text selection; zoom/Fit; design; focus preview; PDF inspection; unsupported-script fallback; mobile updates; autosave/reload.
- Layout widths 320, 390, 1024, 1280, 1440 and 1920: no page-level viewport overflow or unhandled page errors. Desktop and 320px mobile page-layout controls visually inspected, as were custom-entry controls and smart page break.
- Injected parse/render failures show explicit recovery controls; retries recover without fake page counts or unhandled errors.
- Independent frozen-HTML capture: no console errors, failed resources, exceptions, overlay intersections or viewport overflow. Screen-reader-only clipped instructions are intentional.

## Limits
Linux Chromium only; not physical-device testing, cross-browser certification, full accessibility audit or Windows PowerShell execution. Long-entry continuation headings are not automatically repeated. Keep/manual breaks can intentionally leave whitespace or increase page count. Existing Latin-font limitation and prior renderer chunk/eval warnings remain. No automatic font shrinking, content removal, new margin controls or AI Tailor implemented.
