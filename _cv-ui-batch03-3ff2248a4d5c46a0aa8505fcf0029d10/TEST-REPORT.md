# Batch 03 test report

## Scope
Two modified files and two new files; no package, schema, persistence-format or AI changes.
Baseline source hashes verified against all nine Batch 02 payload files.

## Passed in this environment
- TypeScript and Vite production build (2105 modules).
- Desktop 1440x960: mouse drag within the accordion list and the left rail.
- Keyboard Up/Down/Home/End handling; Home/End exercised in browser tests.
- Escape cancels an active pointer move without committing the order.
- Personal details remain fixed at position one.
- Inline accordion opens/collapses; original field editors remain functional.
- One-click preset and custom additions; title editing and multiple paragraphs.
- HTML preview order and JSON backup include reordered custom content.
- Reload restores title, paragraphs and ordering.
- Actual mobile 390x844 touch-enabled Chromium: touch drag through CDP touch events, quick add, editing, confirmation/cancellation of deletion and deletion persistence.
- Quick-add scrolling remains inside the editor; the top bar stays at viewport top.
- No unhandled page errors in automated tests.
- PDF generation: two pages, custom paragraphs retained, custom section and Skills precede Profile in exported text as arranged.
- Visual inspection: desktop overview, active drag, expanded custom section, quick-add view, mobile overview/quick-add/edit, both PDF pages.

## Limits
Tests ran in Linux Chromium, not a user's Windows installation, Safari, Firefox or a physical phone. PowerShell scripts are reused from the prior update; no Windows execution was performed here. No full accessibility certification is claimed.
Existing vm-browserify eval and large react-pdf bundle warnings remain. PDF still uses the existing Latin-script fonts; Arabic shaping/font support is not added.
