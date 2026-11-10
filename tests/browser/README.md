# SC5.1 offline application acceptance

This suite covers the experimental SC5.1 Flash-Lite preview. SC5 retires the automatic summary capability inventory, puts actual work/project facts first in the authoring brief, and adds a limited retained-evidence provenance guard. Same Flash-Lite model/settings, original/lock protection, editor and persistence route. It is not a demonstrated provider-reliability or authoring-quality fix.

## Run

Use Node 24 (the existing SC5 tests use Node's TypeScript stripping API):

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix tests/browser ci --ignore-scripts --no-audit --no-fund
cd tests/browser
npx playwright install chromium
cd ../..
npm run test:browser:offline
```

The setup commands may download dependencies/browser binaries. Browser tooling has its own small package/lockfile under tests/browser; application dependencies and package-lock.json are unchanged. **The test run itself needs no external service, API key, billing, or Gemini access.** On Linux, a machine without Chromium's system libraries may need Playwright's documented system-dependency setup. If a compatible Chromium is already installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable instead of downloading a browser.

The runner starts its own Vite server on `127.0.0.1:4187`. It deliberately refuses to reuse an existing server, disables `.env` loading and HMR, and replaces any inherited Vite/Google/Gemini environment values with a fixed synthetic test key. It does not reuse a user's browser profile or connect to their already-running Windows app. When run locally, it serves the checked-out source in that directory. Each test uses a fresh browser context and fictional IndexedDB data. Test PDFs are written under ignored `test-results/`.

## What is exercised

- The actual Tailor button, SC5 request adapter, full outbound packet/provider schema, native schema/compiler, Zustand store, IndexedDB persistence, editor, and PDF export. Only the external provider HTTP response is mocked.
- Two successful authored fixtures: locked experience with an editable summary, and a locked summary with editable experience. Each creates exactly one separate copy, preserves the original/identity/dates/design/locked fields, accepts a real UI edit, reloads from IndexedDB, and exports a real PDF. The downloaded PDF is parsed with local PDF.js and checked for expected content.
- The user's exact reported HTTP503/UNAVAILABLE message: no copy, unchanged original and persisted data, no second call during the bounded post-error observation, and unchanged state after reload.
- A completed response containing an invented summary reference: the invalid passage is removed, the original summary is retained, and a review note is shown; no duplicate is created if nothing else changed.
- A fictional response that adds an unsupported technology and customer count in one summary passage: that passage is omitted with a visible review note, the supported passage persists through reload and PDF export, and the original CV and its existing certification remain intact. Review notes remain with the tailored copy after reload, resume switching and later editing, but do not appear in the PDF; hiding them lasts only until reload. They are historical notes, not proof of current factual accuracy.
- The real packet excludes a synthetic private-contact sentinel, uses the SC5 settings, and sends only one mocked request in each case.

All external browser HTTP requests are blocked except the one exact SC5 endpoint, which is fulfilled locally. Unexpected external requests fail the tests. Service workers are disabled. Test runner retries are zero. The fixed fake key is not a credential and must never be replaced with a real key.

## Import-to-export fictional fixtures

`import-smoke.spec.cjs` generates small fictional PDF and DOCX files locally, imports them through the real dialog, checks mapped dates and qualification limits, edits the summary, reloads the saved profile, and parses the actual exported PDF. It also checks a two-page source with 30 page-spanning bullets, multipage export with no empty pages or text bounding boxes outside the page, an image-only PDF rejected without changing saved resumes, a two-column PDF, and a clearly identified one-row sidebar/main DOCX table. The table check includes preserved header/footer text; multirow and continuation tables must retain conservative document-order behavior. The browser blocks external traffic; no model call is made. The fixtures do not cover all layouts, visual clipping, fonts, OCR, or real user data.

## Limits

These authored responses are synthetic, not Gemini outputs. Passing proves these bounded application paths only; it does not establish authoring quality, factual safety for arbitrary CVs, provider availability, performance, production security, or every import/export path. The no-retry observation is bounded; existing adapter unit tests also verify one-fetch behavior. Live HTTP503 remains an unresolved provider result, not evidence about quota, billing, or prompt quality.

The suite tests a **development** server because the existing SC5 adapter intentionally disables client-key composition in production. Production compilation is verified separately with `npm run build`; this suite is not a production backend test.

The provider schema requires summarySegments, entries and skillSelections. Selected capabilities stay in native Skills, including qualifications such as Coursework only. Success cases check that no Relevant skills inventory is appended to the summary or exported PDF. Existing model/label expectations are deliberately updated, not removed.

A profile-only introduction falls back to the original summary with a review note, while a stale nonempty SC4 capability field still fails the schema. Both preserve original/saved data. An additional created-copy case checks that a rejected unsupported work rewrite retains the original line and surfaces a review note in the editor. The provenance guard permits exact unchanged original summaries, qualification-led introductions and no-work sources; it cannot establish semantic support or useful writing. See SC5-REPAIR.md. All live budgets are CLOSED; these tests authorize no provider calls.

SC5.1 also sends the bound joined authoringView through the real adapter. A seventh positive case uses complementary classroom contributions plus a selected documentation capability and verifies exact native summary/skill preservation through separate copy,save/reopen and parsed PDF. These authored fixtures are synthetic,not evidence the model selects or writes them. Output schema/compiler/filter semantics and model/settings are unchanged;all live budgets remain CLOSED.

## SC5.3 same-response summary alternative

One fictional, mocked case supplies two copied summary sentences and a separately cited synthesized alternative in the same provider response. The application applies its ordinary local checks to the alternative, saves a separate copy, preserves the original, reloads and exports the selected summary to PDF. It makes one mocked provider request, not a retry. These literal checks do not verify truth or show that a real model will supply a good alternative; the extra output may increase token usage. No live request is authorized by this test.

## SC5.4 shortened-echo selection

A fictional mocked case reproduces a single surviving shortened copy of one work passage and checks that a separately supplied, locally guarded alternative can be selected when it has literal overlap with two distinct cited work facts and passes additional conservative word and causal-phrase checks. These checks can reject good paraphrases and still miss unsupported relationships. The signal does not delete a weak primary when no suitable alternative exists. Citations and word overlap do not prove meaning, factual support or useful writing; this test is not a real model result and authorizes no provider request.
