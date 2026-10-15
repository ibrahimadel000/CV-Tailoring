# Batch 02 test report

Environment: Node 24, Linux, local Chromium, synthetic/demo resume data.

Passed:
- TypeScript and Vite build.
- Desktop header measured at 60px.
- Automatic preview navigation to selected Skills section (scroll changed from the top).
- Collapse/expand editor, focus/exit preview, overview and fit width.
- Custom section creation, rename, multiple paragraphs, navigation and confirmed removal.
- Standard/custom section reordering, same order in live preview.
- Persistence of custom content and section order after refresh; deletion persists too.
- JSON backup includes the new fields; JSON import preserves them.
- Batch 01 JSON backup still imports and retains its old values.
- PDF export with custom title and both paragraphs; text extraction confirms custom section after Profile and before Experience.
- Desktop 1440x960 and mobile 390x844 visual checks.
- No unhandled browser-page errors in automated scenarios.

Not tested/limitations:
- PowerShell execution on Windows, all browser variants, real phone hardware, full accessibility certification.
- No Arabic/RTL PDF work or AI Tailor development.
- Preview is continuous, not an exact paginated PDF layout.
- Existing large PDF chunk / vm-browserify eval build warnings remain; they are not failed builds.
