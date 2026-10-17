# Batch 11 — optional personal photo

## Scope
8 source paths: 6 modified + 2 new. Optional showPhoto/photoShape schema fields; existing optional photoUrl retained. No store/persistence hook, dependencies, package/lockfile, environment or AI-service change. PDF header and visible-content cache key now include the visible local raster photo; hidden images do not reserve layout space or invalidate unrelated UI state.

## Checks passed
- JPG/PNG/WebP selection; signature check, 5MB rejection, corrupt image rejection and tiny-image rejection. Invalid selection does not mutate saved data. 400×400 JPEG output below 500k data-URL limit; actual portrait crop 33,394 bytes; EXIF absent. EXIF orientation=6 is respected; Image-element fallback works when createImageBitmap is unavailable. Pixel tests verify left/right crop coordinates.
- Crop zoom/ranges, reset and pointer movement. Native Chromium CDP touch crop and keyboard range control. Cancel/Escape do not save pixels; focus returns to visible action. Unmount during delayed decode cannot revive old state. Latest file selection wins; abandoned ImageBitmaps are disposed.
- Hide retains source and survives reload; show/shape changes update real PDF. Remove works. Clone removal does not mutate original. Legacy remote URLs and SVG are excluded from rendering instead of being fetched; no remote-photo input feature.
- Each visible exported PDF has exactly one embedded photo, hidden version zero. All sample variants remain 2 A4 pages. Essential circle/rounded square, Editorial and Compact tested; first-page PNGs inspected. Export hash matches the same cached PDF blob as preview. HTML non-Latin fallback includes photo; existing export-font limitation remains explicit.
- Mobile edit/crop/preview, widths 320/390/1024/1440/1920 without horizontal document overflow. Invalid-file error UI inspected. No unhandled page errors in photo suite.
- Batch 10 store regression: independent themes, old shared-theme migration, clone/delete/new defaults, save/reload, invalid-data fail-closed, title clear/legacy/toggle. Section switching/Done anchor and zero stale animations on adding Languages.
- Existing drag regression: same live card/form DOM, persistence, keyboard, Escape/outside/touchCancel/resize, native form scrolling, edge scrolling, reduced motion and save failure/retry. JSON user controls remain absent (new file picker accepts images, not JSON).
- Existing PDF regression: 2→4→2 pages, identical preview/export, labels, selectable text, fit/zoom, templates, focus preview, typed sections, safe non-Latin fallback, mobile reload. Simulated parse/canvas failures recover with retries.
- Final production build and production photo upload/export pass with local PDF worker and no failed requests/page errors. Existing eval/large-chunk build warnings remain. One earlier production harness run raced a rebuild and failed navigation; final production test ran only after the completed build.

## Visual QA
Individually inspected empty desktop personal details, desktop crop and saved photo, mobile photo/crop/preview/error states, circle/rounded/Editorial/Compact first-page PDF renders, and independent frozen-HTML helper screenshot. No unintended overlaps or viewport overflow; image uses crop rather than stretch. Helper reports no console exceptions, failed resources, overlay intersections or viewport overflow. Two sr-only clipping diagnostics are intentional announcement/help text.

## QA stock portrait
Only test contexts and preview PNGs use the public Unsplash image at https://images.unsplash.com/photo-1500648767791-00dcc994a43e . It is not bundled as a default resume photo or required network resource. Production functionality reads the user's local file and stores only the processed crop.

## Limitations
Linux Chromium and emulated touch, not physical iOS/Android, Safari/Firefox, full assistive-technology certification or executed Windows PowerShell. Optional photo metadata is backward-compatible. No cloud sync or original-photo restoration/edit history. Saved JPEG crop intentionally flattens transparency onto white; re-select the original file to undo a previous crop. Source rollback hides photo functionality without deleting stored user data.
