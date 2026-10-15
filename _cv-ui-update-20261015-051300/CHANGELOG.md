# UI Batch 01

## Added
- A focused resume-building workspace with section navigation, an editor, and a continuous live preview.
- Personal/contact details and optional visibility controls, summary, work experience, education, skills, projects, certifications.
- Safe multi-skill input with duplicate prevention; entry reordering and deletion confirmation.
- Essential, Editorial, and Compact single-column templates; colors, font family, text size, and line spacing.
- Real PDF preview and lazy-loaded PDF download using built-in PDF fonts (no dependency on invalid Inter files).
- Resume library: create, rename, switch, duplicate, delete; explicit demo loading.
- JSON backup and schema-validated import as a new document.
- Debounced, serialized IndexedDB persistence; honest save status; unsaved-change warning; save retry without overwriting in-memory edits.
- Load failures stop writes rather than replacing inaccessible saved data.
- Responsive desktop/mobile workspace, native focus-trapping dialogs, visible focus, labels, reduced-motion styles.
- Manifest-based source checks, backup, installer log, and guarded source rollback scripts.

## Modified original files
- `src/App.tsx`: selects the new builder rather than the old AI-centric dashboard.
- `src/index.css`: new fixed-light visual system and responsive layout.
- `src/store/useAppStore.ts`: atomic persistence and validation; blank first document rather than automatic demo content; saved workspace theme.
- `index.html`: builder title, accurate description, and working favicon.

## Preserved
- Original profile data schema and existing IndexedDB profile keys.
- Original AI services, old UI components, parsing, and extension files. They are not deleted or developed in this batch.
- Dependency manifests and all .env files. No API key is required for manual resume building.
