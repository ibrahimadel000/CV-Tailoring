# SC5 offline application acceptance

This suite covers the experimental SC5 Flash-Lite preview. SC5 retires the automatic summary capability inventory, puts actual work/project facts first in the authoring brief, and adds a limited retained-evidence provenance guard. Same Flash-Lite model/settings, original/lock protection, editor and persistence route. It is not a demonstrated provider-reliability or authoring-quality fix.

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
- A completed HTTP response containing an invented source reference: rejected by the real native contract, with no copy saved. This checks that the harness has not bypassed the compiler.
- The real packet excludes a synthetic private-contact sentinel, uses the SC5 settings, and sends only one mocked request in each case.

All external browser HTTP requests are blocked except the one exact SC5 endpoint, which is fulfilled locally. Unexpected external requests fail the tests. Service workers are disabled. Test runner retries are zero. The fixed fake key is not a credential and must never be replaced with a real key.

## Limits

These authored responses are synthetic, not Gemini outputs. Passing proves these bounded application paths only; it does not establish authoring quality, factual safety for arbitrary CVs, provider availability, performance, production security, or every import/export path. The no-retry observation is bounded; existing adapter unit tests also verify one-fetch behavior. Live HTTP503 remains an unresolved provider result, not evidence about quota, billing, or prompt quality.

The suite tests a **development** server because the existing SC5 adapter intentionally disables client-key composition in production. Production compilation is verified separately with `npm run build`; this suite is not a production backend test.

The provider schema requires summarySegments, entries and skillSelections. Selected capabilities stay in native Skills, including qualifications such as Coursework only. Success cases check that no Relevant skills inventory is appended to the summary or exported PDF. Existing model/label expectations are deliberately updated, not removed.

Two additional rejection cases cover a changed profile-only introduction despite available work evidence, and a stale nonempty SC4 capability field. Both preserve original/saved data. The provenance guard permits exact unchanged original summaries, qualification-led introductions and no-work sources; it cannot establish semantic support or useful writing. See SC5-REPAIR.md. All live budgets are CLOSED; these tests authorize no provider calls.
