# Test report — UI Batch 01

Environment: uploaded project, npm ci (lifecycle scripts disabled for review), Node 24, Linux, Chromium. Synthetic/demo data only.

## Passed
- Production preview (compiled build): no external requests and no AI requests in tested builder/export flow.
- Empty-name export prevented; unsupported-script export warning is visible after closing the export dialog.
- `npm run build` (TypeScript project check and Vite production build).
- Browser editing of personal details, summary, experience, education/GPA/honors, skills, projects, and certifications.
- Resume and workspace design persistence after refresh.
- Skill addition, multiple comma-separated values, duplicate prevention.
- Reordering and confirmed removal of education entries.
- Visibility control propagated to resume content.
- JSON backup download, valid import as a new document, rejection of an invalid backup without changing the current resume.
- Storage failure simulation: explicit error, current edits retained, retry saves without reloading older data.
- Storage-load failure simulation: blocked writes and reload guidance.
- Delete all resumes and refresh: empty state persists; no phantom demo is created.
- PDF downloads for all three templates and multi-page content; PDF selectable text inspected.
- Actual browser PDF-preview dialog.
- Unsupported-script PDF attempt: explicit notice instead of silent missing glyphs.
- Desktop viewport 1440×960; mobile 390×844; no horizontal page overflow.
- Visual inspection of desktop builder, blank state, design, library, export, experience editor, mobile edit/preview/design/skills/library/export, save/load errors, empty library, and all template PDF pages.
- No unhandled page errors in automated browser scenarios.

## Expected warnings / limits
- Vite reports the large PDF renderer chunk and the existing vm-browserify eval warning. PDF libraries are loaded on demand; neither warning is a failed build.
- English UI and basic Latin/Western-European PDF fonts in this release. Arabic/RTL export not implemented.
- Native in-browser PDF viewing depends on browser PDF support; file download is available separately.
- Full accessibility certification, all-browser compatibility, real mobile-device testing, and Windows script execution have not been performed.
- PowerShell scripts reviewed but NOT executed: PowerShell is not installed in this Linux environment. Verify with `-WhatIf` and use a project copy for the first local installation.
- The source rollback does not roll back browser resume data.
