# SC5.1 contextual authoring — offline repair candidate

## What changed and why

SC5's completed two-request batch was not writing-accepted. The backend opening used a target-specific focus not established by its cited work fact,largely paraphrased one contribution and omitted an explicitly relevant documentation capability. No passage was filtered. Fictional limitations survived,but this did not demonstrate broad writing improvement.

The native compiler already accepts useful supported synthesis and selected documentation. SC5.1 changes the writer's positive input and instructions rather than adding another gate:

- Join exact contribution text with its actual role/organization and lock context.
- Join every native skill's exact text/qualification with original source group context;skills outside groups remain explicitly visible. Distinct contexts are retained. This is not ranking,keyword matching or an inference about employer use.
- Distinguish the vacancy's focus/title from candidate history;ask for supported synthesis instead of a first-bullet paraphrase and whole-job capability coverage,including supporting duties.
- Keep the three-field output contract and existing native filtering/compiler/locks unchanged. No automatic capability inventory,hardcoded user answer,second stage,reviewer,retry,fallback or model switch.

This is a causal hypothesis about authoring input usability,NOT proof that the model now writes better. Static instruction tests verify presence,not compliance. Existing weak SC5 output still compiles;we do not silently repair prose or pretend IDs certify meaning.

## Version and scope

- Branch:repair/evidence-first-authoring;draft PR5 remains stacked on SC4,not main.
- Increment base:2fcbc9ff2a55ed0b245da8cb9817f4c06e5f9891,with SC5 runtime dbe378e2def693924309bdcaeade50ddbf7b2fc7. Main remains45d065b5a84779115a783739b13dc6953ad3bc15.
- Visible label:SC5.1 · Gemini 3.5 Flash-Lite · experimental.
- Packet revision:document-compose-natural-segments-6-contextual-authoring.
- Prompt SHA256:6cbfcfb6dd7c652e2d5ebf8d7473a32b579279811814d94e489565f64135af3e.
- Same gemini-3.5-flash-lite,medium thinking,8192 maximum output tokens,300000ms deadline,default sampling,one fetch,no retry/fallback. Joined source views increase input text;existing180000-character adapter limit unchanged. Development adapter only;production client-key composition stays disabled.

Exact incremental runtime files:
1. src/services/resumeComposer/authoringView.ts (new):pure joined source-context view.
2. src/services/resumeComposer/naturalDocument.ts:include bound authoring view,revision and positive instructions. Output schema and compiler/filter logic unchanged in this increment.
3. src/services/resumeComposer/request.ts:visible SC5.1 identifier only.

Exact incremental tests:
- tests/contextual-authoring.test.cjs (new):8source-view/compiler/policy tests.
- tests/natural-summary-authoring.test.cjs:expected packet revision.
- tests/summary-preview-sc1.test.cjs:frozen prompt hash and visible identifier.
- tests/browser/sc1-app.spec.cjs:identifier,real outbound view,positive synthesis/documentation save/reopen/PDF case;prior assertions retained.

Documentation:STATE.md,TASK.md,tests/browser/README.md and this guide. SC5-BATCH01.md remains the historical closed result. No dependency/lockfile,native store/editor/design/import/export or candidate identity/date/qualification changes. Existing saved CVs/PDFs are not rewritten.

## Verification and remaining limits

Linux Node24:824/824 unit tests,7/7 offline browser scenarios and production build passed;existing large-bundle warning remains. All unit/build work blocks external network;browser provider requests are locally fulfilled with fake keys and fictional CVs. The new browser case confirms complementary supported summary and selected documentation through the actual native compiler,editable copy,persistence and parsed PDF. Other cases retain editing/locks/original preservation/503-no-retry/invalid-reference/stale-output checks.

Private offline replay of the two existing cases verifies all native capabilities remain visible and old returned text is not silently changed. No fresh writing produced;no real API requests. Source-view tamper rejection is structural,not semantic truth. This does not establish arbitrary factual safety,all import layouts,provider reliability or writing acceptance.

Status:prepared/offline-verified,not installed on the user's Windows machine or live-writing-accepted. ALL live budgets CLOSED. Do not rerun SC5-Authoring-Batch01 or click Tailor. No new evaluation package is released with this increment. A fresh finite evaluation requires separate explicit agreement;do not reuse any ledger or budget. Do not merge/deploy or claim completion based on offline passes.

## Optional reversible local source preview — no provider call

Review draft PR5 before installing. Stop Vite. Back up the project privately;keep .env and browser data private and never clear site storage. In PowerShell:

```powershell
Set-Location 'E:\cv tailor - Copy'
git status --short
```

If there are any local changes,untracked files you need,a wrong repository or no Git checkout,STOP. Do not reset,clean,force,blindly stash or overwrite. With a clean verified checkout,record the starting branch/commit and unique backup marker:

```powershell
git branch --show-current
git rev-parse HEAD
$backup = "backup/pre-contextual-$(Get-Date -Format yyyyMMdd-HHmmss)"
git branch $backup
if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Stop.' }
Write-Host "KEEP THIS ROLLBACK BRANCH: $backup"
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed. Stop.' }
```

Inspect the current PR head and local branch before switching. If the repair branch does not exist locally,use `git switch --create repair/evidence-first-authoring --track origin/repair/evidence-first-authoring`. If it already exists,do not overwrite it;inspect and reconcile its head first. Stop on any refusal or unexpected drift. No default-branch merge is required. Confirm checked-out HEAD matches the PR's current head before running tests.

With Node24 and existing dependencies:

```powershell
node --test tests/*.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Offline tests failed. Stop.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed. Stop.' }
npm run test:browser:offline
if ($LASTEXITCODE -ne 0) { throw 'Browser checks failed. Stop.' }
npm run dev
```

Browser checks need the existing separate test dependencies and compatible Chromium;see tests/browser/README.md. Setup can download packages,but the tests use no real provider. Confirm SC5.1 label. STOP before Tailor;no live budget exists. Existing stored CVs remain plain editable native profiles.

Rollback:stop Vite;confirm a clean tree;`git switch` to your exact printed backup branch,then `npm run dev`. Do not reset/clean/force. Git rollback restores source,not browser-stored changes. Existing SC5 batch runner intentionally refuses this changed source and must not be edited or rerun to bypass the closed budget.

## Newly approved single writing trial — specific authorization

After this offline checkpoint,the user explicitly approved SC51-Backend-Trial01. Only ONE fixed anonymized original-source/backend-job request is authorized on current SC5.1:gemini-3.5-flash-lite,medium thinking,8192output,300s,default sampling,no retry/reviewer/fallback or second case. Close on completion or any HTTP/transport/timeout/incomplete/contract/local failure. All previous budgets remain CLOSED. This specific approval supersedes earlier all-budgets-closed wording only for this single trial.

Prepared local runner uses pinned actual adapter/schema/compiler and existing local Vite key privately. Source/package hashes checked before key access;--check sends nothing and reads no key. Exclusive ledger reserved/fsynced before fetch under %USERPROFILE%/CV-Tailor-Authoring/SC51-Backend-Trial01;do not delete/move/rerun. Share only SC51-Backend-Trial01-results.json,which includes generated professional writing and reference outcomes,not keys/thoughts/raw HTTP errors. No project/browser-storage writes. It is not a saved-browser-CV/PDF trial. No new requests during preparation;15/15offline safety checks pass. Follow delivered README-FIRST.md for safe clean-tree fast-forward source update and exact one-shot command. Do not use either older runner or make extra Tailor clicks.

Acceptance:useful supported synthesis across relevant actual work where warranted,no target specialty invented as candidate history,relevant native capability coverage and preserved relationships/actor/strength/scope/qualifications. Native compilation alone is insufficient. Do not automatically release another variation if the trial fails;revisit the hypothesis using the returned text. No merge/deployment/billing change authorized.

## Completed SC51 trial and recorded-output replay — supersedes prepared trial status

SC51-Backend-Trial01 CLOSED1/1,no retries,HTTP200/native compiled,original unchanged by report,zero summary removals. Matched source/job verified against SC5. Assistant review:material improvement and useful broadly supported writing for this one case,not user acceptance or general certification. Operational/application synthesis and documentation coverage improved;no unsupported backend specialty or invented API/testing/performance/employer-tool relationship observed. Good work text/order unchanged,which is permitted.

Remaining polish:alignment clause's strongest explicit supporting work reference omitted;database product category does not follow Tools guidance. Optional SaaS skill coverage could improve,but retaining every preferred skill is not required. Do not treat these as proof the whole candidate is useless or automatically issue another prompt revision.

Exact recorded output/source was replayed through the real SC5.1 app using one locally fulfilled response and ZERO new provider calls. Source hash matched. Separate copy,original/identity/education/certifications/design preservation,save/reopen,editor edit/reopen and parsed PDF passed. This private isolated replay is not the user's installed Windows profile;private writing/source/PDF remains out of GitHub.

ALL budgets CLOSED again. No new product-code change during review. Next is user-side actual stored-CV/application acceptance,not another helper comparison. A new app Tailor action requires explicit separate finite approval before it occurs. Keep SC5.1;no merge/deploy/default-branch/billing change. Overall goal is not yet declared complete.
