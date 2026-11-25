# CV Tailor Studio — Current State

- **Branch:** `fix/cv-tailor-phase1-phase2`
- **Verification:** `1,005/1,005` unit tests passing (`node --test tests/*.test.cjs`) and clean production build (`npm run build`).

## Completed Phases

- **Phase 1 — Reliability, Cancellation & Data-Leak Fixes:** Added abortable, byte-capped response reading (`boundedResponse.ts`), tightened timeouts (90s), removed deprecated models, prevented overlapping provider calls during cancellation, fixed `TailoredCopyNotice` vs. `ImportedCVNotice`, and blocked `IMPORTED DETAILS` from preview/PDF.
- **Phase 2 — Tailoring Quality & Balanced Guards:** Eliminated false-positive reverts on sentence-initial action verbs, written numbers, operations management across teams, and conceptual/process skills while keeping hard guards against invented tech, numbers, and scope inversions; upgraded to Plan-Then-Write prompting with selective skill pruning.
- **Phase 3.1 — Interactive Diff & PDF Polish:** Added word-level inline diffs (`TailorDiffReview.tsx`) with 1-click summary/bullet revert and skill restore chips, sharper bullet-tightening examples, and disabled awkward PDF mid-word hyphenation.
- **Phase 3.2 — Backend `/api/tailor` Proxy:** Added platform-agnostic `server/tailorHandler.mjs` with adapters for standalone Node (`server/index.mjs`), Cloudflare Pages (`functions/api/tailor.ts`), and Vercel (`api/tailor.ts`).
- **Phase 3.3 — Dead-Code Cleanup & Docs:** Removed 40 verified unreferenced legacy files and 5 unused packages, decoupled live tailoring from 10 legacy v2 modules (`tailorConnection.ts`), and added `README.md`.
