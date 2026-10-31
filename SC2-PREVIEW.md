# SC2 — reversible Flash-Lite application preview

**Experimental candidate, not a proven503 fix or accepted CV writer.** This is an installable application branch, not a detached request helper. Main still contains SC1.

## Exact scope

Only two runtime constants change, both in `src/services/resumeComposer/request.ts`:

- Model: `gemini-3.8-flash` → `gemini-3.5-flash-lite`.
- Visible label: `SC2 · Gemini 3.5 Flash-Lite · experimental`.

Unchanged: revised summary brief (SHA256 `14e0416d54bbe78da56fc9f6ad37dcb9773ec38c7175fd82fd8b024093e4b29a`), source packet, provider schema, native compiler, one-action/separate-copy workflow, locks, identity/dates/qualifications, editor/store/design/import/export,300000ms deadline, medium thinking,8192maximum output tokens, provider-default sampling, one request/no automatic retry or fallback. Legacy unused adapters are not changed. Root application dependencies and lockfile are unchanged.

The branch starts from `test/sc1-offline-app-acceptance@4cd5eb76ae5753648b9937ef463d2ca6b83c57af`, so it includes that PR's isolated browser-test tooling without needing a merge into main. Its focused PR targets that test branch; compare runtime against main and only the two constants above differ.

## Why this candidate, and what is not established

The user-approved, now-closed Batch01 recorded one successful simplified response per model:3.8Flash235586ms and3.5Flash-Lite9450ms; both HTTP200/STOP with expected JSON shape. They were sequential observations, not a repeated performance benchmark. They used a small fictional request, not the complete SC1 app request. No generated wording was retained. These results justify investigating a candidate preview, not a guarantee of faster real CV writing, factual quality, or provider reliability.

## Safely apply locally (PowerShell)

1. Stop the existing Vite/dev server with Ctrl+C. Keep your existing browser resumes; do not clear browser storage.
2. Run the following in your project. It stops on local changes instead of stashing, resetting or overwriting them. It creates a backup branch of your clean current commit before switching. Your ignored local `.env` stays in place and must not be committed or shared.

```powershell
Set-Location "E:\cv tailor - Copy"
$changes = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "Could not inspect Git status. Stop here." }
if ($changes) {
    $changes
    throw "Local changes exist. Stop here; do not reset or force checkout."
}
$backupBranch = "backup/pre-sc2-$(Get-Date -Format yyyyMMdd-HHmmss)"
git branch $backupBranch
if ($LASTEXITCODE -ne 0) { throw "Backup branch was not created. Stop here." }
Write-Host "KEEP THIS ROLLBACK BRANCH: $backupBranch"
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "Fetch failed. Stop here." }
git switch --create preview/sc2-flash-lite --track origin/preview/sc2-flash-lite
if ($LASTEXITCODE -ne 0) { throw "Checkout stopped. Do not force/reset; report Git status only." }
node --test tests/*.test.cjs
if ($LASTEXITCODE -ne 0) { throw "Offline tests failed. Stop here." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed. Stop here." }
npm run dev
```

The local application uses the same runtime dependencies as SC1; no new application dependency installation is required when your existing SC1 setup is intact. The browser test runner has separate optional setup under `tests/browser/README.md`.

3. Open the localhost URL printed by this fresh Vite process. Verify **SC2 · Gemini 3.5 Flash-Lite · experimental** in the Tailor pane. If you still seeSC1, you are viewing an old server/tab; do not test until the visible version matches. Version checking/startup does not send a generation request.
4. **Stop at the version check.** The earlier two-call budget is closed. This preparation does not authorize another live Tailor request. Agree a new finite full-app trial before clicking Tailor. No claim of Windows installation is made until you confirm applying this branch.

## Roll back without erasing browser data

Stop the dev server. Ensure `git status --porcelain` is empty. In the same PowerShell session run `git switch $backupBranch`, then `npm run dev`. If the session was closed, replace `$backupBranch` with the exact backup branch printed above. If Git reports local changes or refuses the switch, stop; do not use reset/clean/force. Switching back does not clear stored resumes or change your local key.

## Verification and status

The historical test filenames `tests/summary-preview-sc1.test.cjs` and `tests/browser/sc1-app.spec.cjs` are retained to avoid needless rename churn. Their active-model/visible-label expectations now explicitly pinSC2; the transport endpoint assertion in `tests/resume-composer.test.cjs` is also updated. Original prompt-hash, payload/settings, no-retry, preservation, save/reopen/PDF and negative-contract assertions remain in place; no acceptance checks were disabled.

Final sandbox verification: **792/792 unit tests, 4/4 mocked browser cases, and production TypeScript/Vite build passed.** The first unit run exposed one stale endpoint assertion; it was updated, not removed, and the full suite then passed. See the PR and STATE.md for details. Browser fixtures are mocked synthetic data, not actual model authoring. No additional Gemini calls, billing changes, merge or deployment are included. The large production-bundle warning is an existing issue, not addressed by this preview.
