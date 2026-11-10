# SC3 — focused summary-authoring candidate

Experimental, reversible application preview. Not a proven writing fix. This supersedes the SC2 installation guide for this candidate only; SC2 remains available for rollback.

## Exact version and runtime scope

- Branch: `preview/sc3-summary-focus`.
- Base: `preview/sc2-flash-lite@e2a34be9f784aefd13b96b588aca630d6eb9f2a3`. Focused PR targets that branch; neither this nor the earlier PRs must be merged to check out the preview.
- Visible identifier: **SC3 · Gemini 3.5 Flash-Lite · experimental**.
- `src/services/resumeComposer/naturalDocument.ts`: two editorial-guidance paragraphs change inside `naturalInstructions`. Prefer target-relevant narrative evidence to a vague inherited introduction; synthesize related contributions rather than repeat one bullet. Added contrast uses fictional archive work, not the user's private CV or a hardcoded backend answer.
- `src/services/resumeComposer/request.ts`: visible label only. Model unchanged: `gemini-3.5-flash-lite`; medium thinking,8192maximum output tokens,300000ms timeout, provider-default sampling, one request/no retry/no fallback.
- Prompt SHA256: `c85ba52daeef3888826910699cf17ed44a919209c0013c0a02e0a2342f723766` (SC2: `14e0416d54bbe78da56fc9f6ad37dcb9773ec38c7175fd82fd8b024093e4b29a`).
- Unchanged: packet revision/shape, output schema, evidence policy, compiler, summary boundary, locks, preservation of original/identity/dates/qualifications, separate-copy workflow, editor/store/design/import/export, dependencies and lockfiles. Packet revision stays the same because its contract did not change; label and hash identify the new instructions.

## Why this bounded change

The user reported one successful SC2 Tailor request and confirmed that it created a separate copy while preserving the original. Review of the supplied original and tailored PDFs found that the summary retained generic technology/management wording despite more relevant work evidence. The experience was largely retained and reordered; relevant backend skills were selected without inventing testing or performance work.

Important constraint: existing policy intentionally keeps skill-list-only material out of generated summaries. SC3 does NOT relax that boundary. A listed skill does not establish employer/project use, proficiency or a relationship to an outcome. The earlier conversational suggestion to add a listed-skills sentence was not compatible with that policy and is not implemented.

Acceptance target for a later real output: a specific introduction to documented work relevant to the job; supported actor, scope, strength and relationships; no skill-to-employment promotion or invented testing/performance; no generic filler or copied-bullet inventory. No private CV, name, contacts or real job-specific answer is embedded in code/tests.

## Apply safely on Windows (PowerShell)

Stop the running dev server with Ctrl+C. Keep browser resumes and the existing local key; do not clear storage or share `.env`.

```powershell
Set-Location "E:\cv tailor - Copy"
$changes = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "Git inspection failed. Stop here." }
if ($changes) {
    $changes
    throw "Local changes exist. Stop; do not reset, force checkout or overwrite files."
}
$backupBranch = "backup/pre-sc3-$(Get-Date -Format yyyyMMdd-HHmmss)"
git branch $backupBranch
if ($LASTEXITCODE -ne 0) { throw "Backup branch failed. Stop here." }
Write-Host "KEEP THIS ROLLBACK BRANCH: $backupBranch"
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "Fetch failed. Stop here." }
git switch --create preview/sc3-summary-focus --track origin/preview/sc3-summary-focus
if ($LASTEXITCODE -ne 0) { throw "Checkout stopped. Do not force/reset; report Git status only." }
git rev-parse HEAD
node --test tests/*.test.cjs
if ($LASTEXITCODE -ne 0) { throw "Offline tests failed. Stop here." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed. Stop here." }
npm run dev
```

No new application dependencies are needed if the working SC2 setup is intact. Browser tests have separate optional setup in `tests/browser/README.md`.

Open the fresh localhost URL and confirm the exact SC3 label. If it still says SC2, stop: an old server/tab may still be active. Startup/version checking does not make a generation request. **Stop at this version check: every previous live budget is closed, including the one SC2 full-app request. Do not click Tailor until a separate finite SC3 trial is agreed.**

## Rollback

Stop the dev server. Confirm `git status --porcelain` is empty; if not, stop instead of discarding changes. In the same PowerShell session, run `git switch $backupBranch`, then `npm run dev`. In a new session, replace the variable with the exact printed backup-branch name. No reset/clean/force, storage deletion or key replacement is needed.

## Verification and limits

Final verification: **795/795 unit tests, 4/4 mocked browser cases, and production TypeScript/Vite build passed.** Existing large-bundle warning remains. An initial new test used an incorrect trace-field name; it was corrected to sourceId and the complete suite rerun. Browser checks verify the SC3 guidance appears in the actual intercepted request. See STATE.md and the PR for exact changed files. Tests use manually authored synthetic outputs. New coverage documents both a compact, narrative-supported reference summary and the limitation that generic but supported text still compiles. Static instruction/hash tests establish payload content, not model compliance. No semantic verifier, deterministic rewriting, extra provider step or live request has been added. Existing preservation, invalid-reference,503/no-retry, save/reopen and PDF checks remain.

Prepared/offline-verified does not mean Windows-installed, manually tested, writing-accepted, merged or deployed. PDF pagination remains a separate unresolved issue; it is not changed here.
