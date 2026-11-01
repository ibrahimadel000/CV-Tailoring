# Evidence-first authoring repair — offline candidate

## Outcome and limits

SC4's observed backend response shortened generic profile context instead of using relevant professional evidence; no summary passage was removed. Its automatic capability renderer then printed raw source-group labels. SC5 removes that renderer and gives the writer actual professional facts first, separate from qualifications and inherited profile wording. Native skill selections remain editable and qualified.

A changed, nonempty introduction must retain a work/project or qualification reference when work/project facts exist. Exact unchanged original summaries are allowed; qualification-led introductions and sources without work/project narrative remain possible. The guard runs after existing filtering. It rejects the observed profile-only rewrite but cannot guarantee truthful relationships or useful writing: a generic sentence with a valid work reference can still pass. A rejection leaves resumes unchanged; it does not create a better replacement. No template answer, keyword ranker, extra reviewer, model, retry or fallback was added.

Status: prepared/offline-verified candidate for review. Not Windows-installed, manually tested or writing-accepted. Existing saved CVs and exported PDFs are not automatically rewritten. No fresh model outputs were generated. All provider budgets are CLOSED; do not click Tailor or rerun any previous batch under this delivery.

## Version and settings

- Branch: repair/evidence-first-authoring.
- Base: preview/sc4-evidence-aware-authoring at a46e1b6a41c7fb9b2785543766b24a0161a3df02; review against that branch, not main. Main remains45d065b5a84779115a783739b13dc6953ad3bc15.
- Visible identifier: SC5 · Gemini 3.5 Flash-Lite · experimental.
- Packet revision: document-compose-natural-segments-5-evidence-first.
- Prompt SHA256: d556feb2746251c6aed6cb2d174062ad0d860323875a1b938e217110828c478c.
- Unchanged: gemini-3.5-flash-lite; medium thinking;8192 maximum output tokens;300000ms deadline;default sampling;one fetch;no automatic retry/fallback;existing180000-character adapter input limit. Professional facts are repeated in a compact authoring view; very large inputs remain subject to that existing limit.
- Development adapter only. Production client-key composition stays disabled. No key, account, environment or billing change.

## Exact changed files

Runtime:
- src/services/resumeComposer/references.ts — positive work/project/qualification facts before profile context, exact source data.
- src/services/resumeComposer/naturalDocument.ts — three-field provider contract, evidence-first packet/prompt, limited retained-reference guard.
- src/services/resumeComposer/summaryCapabilities.ts — retire nonempty capability append explicitly; tolerate absent/empty legacy payloads.
- src/services/resumeComposer/request.ts — visible version label only; model/settings unchanged.
- src/components/builder/ComposerTailorWorkspace.tsx — summary notice counts no longer include retired append.

Tests:
- tests/evidence-first-authoring.test.cjs (new)
- tests/natural-document.test.cjs
- tests/natural-summary-authoring.test.cjs
- tests/summary-authoring-policy.test.cjs
- tests/summary-capabilities.test.cjs
- tests/summary-preview-sc1.test.cjs
- tests/browser/sc1-app.spec.cjs

Documentation: STATE.md, TASK.md, tests/browser/README.md and this file.

No dependency/lockfile, native store/editor/design/import/export implementation or source CV data changes.

## Verification

Linux Node24:816/816 unit tests passed;6/6 offline browser scenarios passed;production build passed with the existing large-bundle warning. Unit tests explicitly retain exact-unchanged-summary behavior, qualifications and locked/no-work sources. A negative semantic-limit test demonstrates that generic text plus a valid reference can still pass.

Browser checks use fictional CVs, a fake key and locally fulfilled provider responses; external requests are blocked. They exercise the actual UI/compiler/store, separate copy, locks, edit/save/reopen, PDF,503/no retry,invalid references,profile-only rewrite rejection and stale capability rejection. No new API requests. This does not prove every import/export path or production-backend behavior.

Offline replay of previously returned SC4 batch data: the old backend payload is rejected for the retired field; with only that field removed for isolation, its profile-only rewritten narrative is rejected. The earlier concrete SC3 narrative remains structurally acceptable; the scoped unchanged classroom introduction remains acceptable. Reconstructed source profiles are not an exact installed browser export. This is regression/failure detection, NOT improved generated writing.

## Optional reversible local preview — no Tailor call

You do not need another blind install/API loop to review this candidate. Inspect the draft PR first. If you choose to inspect locally, stop the old Vite process. Back up the entire project directory privately, including local-only files; do not upload it. Preserve existing browser storage (do not clear site data). Changing the Git branch does not roll back browser-stored resume edits.

In PowerShell:

```powershell
Set-Location 'E:\cv tailor - Copy'
git status --short
```

If there are any local changes or untracked project files you need, STOP and reconcile them; do not reset, clean, force checkout, overwrite or blindly stash. Keep the existing environment private. In a clean repository, record the original branch/commit and create a rollback marker:

```powershell
git branch --show-current
git rev-parse HEAD
git branch backup/before-evidence-first
# If that backup name already exists, choose a new unique name; never force it.
git fetch origin
git switch --create repair/evidence-first-authoring --track origin/repair/evidence-first-authoring
```

If the repair branch already exists, stop and inspect it before switching/pulling; do not overwrite it. Confirm the checked-out commit matches the PR's current head. If this directory is not a Git checkout or differs from the expected SC4 base, stop rather than applying guessed file replacements.

With Node24 and existing installed dependencies:

```powershell
node --test tests/*.test.cjs
npm run build
npm run test:browser:offline
npm run dev
```

The browser suite needs its separate installed test dependencies and compatible Chromium (see tests/browser/README.md); setup may download packages, but tests use no real provider. Do not change runtime dependencies or disclose keys to resolve a local setup problem. Confirm the SC5 label in the app. STOP before Tailor: no live budget is authorized. Review saved originals without clearing storage. Local test/build success is not writing acceptance.

Rollback after stopping Vite:

```powershell
git status --short
# Only with a clean tree:
git switch backup/before-evidence-first
npm run dev
```

Use your recorded unique backup branch name if different. Do not use destructive reset/clean. Git rollback restores source, not browser-storage edits. No merge, deployment or default-branch push is part of this preview.

## Acceptance still required

Before claiming the writing problem solved: agree one new finite evaluation with exact cases/settings/stopping rules; judge actual outputs for scope, actor, strength, relationships, relevant synthesis, useful ordering and preservation. Structural success and provenance are not enough. Never reuse a closed budget.
