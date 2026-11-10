# SC4 — evidence-aware authoring candidate and fixed comparison

**Candidate, not an accepted writing fix.** SC3's generated summary did not improve the user's case. SC4 changes the authoring contract rather than adding diagnostics or another model/reviewer. Main remains unchanged.

## Version and exact runtime changes

Branch: `preview/sc4-evidence-aware-authoring`, based on `preview/sc3-summary-focus@b347b037240b3912dbe56d91db434a55a8918238`. The focused PR targets that branch; do not merge any PR to install this preview.

Visible identifier: **SC4 · Gemini 3.5 Flash-Lite · experimental**.

Runtime files:
1. `src/services/resumeComposer/naturalDocument.ts`: document-wide authoring brief; new source-ID-only summary capability channel; native validation/binding and combined summary budgets. Packet revision becomes `document-compose-natural-segments-4-capability-separation`.
2. `src/services/resumeComposer/summaryCapabilities.ts`: new pure source-bound renderer. Up to four distinct retained skill IDs, no model-authored capability prose. Exact source wording/levels and original contexts are preserved under the explicit English UI label `Relevant skills:`. No inferred employer/tool/result relationship or proficiency. This may read as a labelled skills line, not free prose; its editorial usefulness is a live evaluation question.
3. `src/services/resumeComposer/request.ts`: SC4 visible label only. Transport/model/settings unchanged.
4. `src/components/builder/ComposerTailorWorkspace.tsx`: existing removal notice correctly recognizes a remaining source-bound capability line. No diagnostic feature or persistence change.

The old restriction is changed deliberately: freely authored skill-list-only summary claims are still filtered, but truthful, explicitly labelled capabilities now have their own controlled channel. Unknown, repeated, unselected or equivalent repeated IDs reject before save; locked summary forbids capability selections; an independently locked skills section stays untouched. Empty capability selection is valid. Older authored fixtures replay with an absent field defaulting to []; the current provider schema requires the field.

Prompt SHA256: `a158ded8f47c234ce2124a4dfc0161e32322787c365ab5ce9f41b2a3e3608146`.
Model/settings: `gemini-3.5-flash-lite`, medium thinking,8192maximum output tokens,300000ms deadline, default sampling, one request/no retry/no fallback. No dependencies/lockfiles changed. Preserve original/identity/dates/qualifications/locks, separate copy, native editor/store/design/import/export. No layout or pagination fix is included.

## Offline verification

-808/808 unit tests passed (795 previous +13 capability regressions), no skips.
-4/4 mocked Chromium app cases passed: capability label and coursework qualification survive real summary rendering; editing/save/reopen and actual PDF text; original/locks preserved; exact503/no retry; invented references rejected. A stale expected provider-field list was updated for the deliberate contract change, not removed.
-TypeScript/Vite build passed; existing large-chunk warning remains.
-9/9 one-shot batch guard tests passed with synthetic responses: four-call ceiling, exclusive ledger, failure stop, no extra adapter call, native compile, source preservation and credential suppression.
-No real Gemini requests made during preparation. Tests cannot establish model compliance or improved real writing.

## Apply safely in PowerShell

Stop the running Vite server with Ctrl+C. Keep local credentials and browser resumes; never clear browser storage or commit/share `.env`.

```powershell
Set-Location "E:\cv tailor - Copy"
$changes = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "Git inspection failed. Stop." }
if ($changes) { $changes; throw "Local changes exist. Stop; do not reset or overwrite." }
$backupBranch = "backup/pre-sc4-$(Get-Date -Format yyyyMMdd-HHmmss)"
git branch $backupBranch
if ($LASTEXITCODE -ne 0) { throw "Backup failed. Stop." }
Write-Host "KEEP THIS ROLLBACK BRANCH: $backupBranch"
git fetch origin
if ($LASTEXITCODE -ne 0) { throw "Fetch failed. Stop." }
git switch --create preview/sc4-evidence-aware-authoring --track origin/preview/sc4-evidence-aware-authoring
if ($LASTEXITCODE -ne 0) { throw "Checkout stopped. Do not force/reset; report Git status only." }
git rev-parse HEAD
node --test tests/*.test.cjs
if ($LASTEXITCODE -ne 0) { throw "Offline tests failed. Stop." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed. Stop." }
npm run dev
```

With an intact SC3 dependency setup no new app installation is needed. Confirm the SC4 label at the fresh localhost URL. **Do not click Tailor as an extra test.** The authorized four requests belong to the fixed comparison below, not four discretionary clicks. All earlier budgets are closed.

## Authorized comparison: SC4-Authoring-Batch01

Extract the supplied evaluation ZIP into a new directory. Read its README and review `cases.private.json`; it contains professional CV/job text but no credentials or personal contacts. It is not committed to GitHub.

The cases are:
- Professional content reconstructed from the supplied original CV PDF and the full backend job. Same source is used in both arms. This is NOT an export of the installed browser profile: source grouping, unlocked editable sections and anonymized identity are explicit evaluation inputs; import and original layout are not being retested.
- A fixed fictional PHP/MySQL classroom and tutor-assistance case with course-only levels, no production work, no implemented API, no automated tests, and an unfinished degree.

Order: backend SC3, backend SC4, fictional SC3, fictional SC4. Exactly one native adapter invocation per arm, sequential; maximum4requests total. Actual pinned application instructions, packet/schema, adapter and native compiler run from hash-checked snapshots. Same model/settings. No browser storage or app writes from the comparison runner. The separately available SC4 app branch is the installable preview, not replaced by this helper.

Stop on any HTTP/transport/deadline/incomplete/contract/local failure; unused requests close. No retries, reviewers, fallback, extra calls or reruns. Ledger is created exclusively and reserved/fsynced before fetch in `%USERPROFILE%\CV-Tailor-Authoring\SC4-Authoring-Batch01`. Do not delete/move it to repeat a budget. The runner checks package and checked-out runtime hashes and reads the existing local Vite development key privately.

From the extracted evaluation directory, once only:

```powershell
node .\SC4-Authoring-Batch01.cjs --project "E:\cv tailor - Copy"
```

Allow up to20minutes total (up to5minutes per request). The output file path is printed at completion. Share only `SC4-Authoring-Batch01-results.json`. It contains generated professional writing, source evidence and scoped compile metadata for actual review; no API key, .env, personal contacts, thought text or raw HTTP error bodies. Do not share the ledger or raw network logs. A structurally valid result is not accepted writing.

## Acceptance and current limits

Compare actual outputs against source, not just one another. Reject invented practice, strength, actor, technology-to-employer relationship, lost classroom/assistance/coursework/degree limitations, generic-only opening or repetitive bullet inventory. Assess whether the backend introduction is useful, experience ordering/clarity improves, and capabilities stay selective and accurately qualified. Preserve valid existing prose when it already works. Singleton outputs do not prove reliability or typical latency. The results may reject SC4; do not declare success in advance.

Status: prepared/committed/offline-verified after PR creation; SC4 not yet Windows-installed, live-evaluated or writing-accepted. No merge/deployment/billing/default-branch edits. A browser Tailor run after the four-request comparison would need a separate authorization.

## Rollback

Stop Vite, check `git status --porcelain` is empty, then `git switch $backupBranch` in the same PowerShell session and `npm run dev`. In a new session use the exact printed backup-branch name. If Git refuses, stop—no reset/clean/force. Branch rollback does not erase stored resumes or change the key. Existing SC4 copies remain editable plain native profiles; rollback does not undo or delete them.
