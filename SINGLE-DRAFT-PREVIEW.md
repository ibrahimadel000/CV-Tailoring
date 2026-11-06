# Single-draft editorial preview

This is an experimental branch, not a release or a proven writing-quality fix. It uses one Gemini request and asks for one tailored document. It sends the full supplied job and professional-source data to Google; API charges may apply. The model can still copy text, omit important details, change meaning, or invent claims. Source references and local literal checks are not factual or semantic verification. Review the entire resulting CV against the source and job before using it.

## What changed

- The active provider input contains the source text once; the summary/skills guides and reference policy use IDs rather than duplicated text. The full job remains available.
- The provider grammar asks for only the primary summary, experience/project entries, and skill selections. Alternative summary and entry drafts are no longer requested, reducing output burden; consequently the app no longer receives those alternatives from this active provider. The compiler can still read historical alternative-bearing responses for compatibility.
- Original source data, editable-copy isolation, locks, source-reference validation, guard and warning behavior, and the no-automatic-retry policy remain. A partly filtered summary can still be weak and warrants review. An unchanged strong original can be valid; a count of rewrites is not a quality metric.
- This is a development preview. Public deployment requires a secure server-side provider adapter, not a browser-exposed API key.

## Offline verification

Node 24 is required for the existing offline test helpers. From a separate checkout:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/*.test.cjs
npm run build
```

Browser tests require separate browser-test dependencies and a compatible local Chromium; see `tests/browser/README.md`. Those tests mock the provider and do not prove live model behavior or cover every document layout.

## Optional private evaluation

Only after explicitly agreeing to send the chosen case to Google: the private runner reads a JSON case with `profile` and `job`, and reads the existing development key through Vite's development-mode environment selection. It makes at most one request per invocation, never retries, creates a uniquely named results folder outside the repository, and does not change browser data or resumes. Each invocation is another potential billable request and must be within an explicitly agreed request budget. The command requires the explicit `--send-one-request` flag:

```powershell
node scripts/evaluate-single-draft.cjs "<private-case.json>" "<existing-env-directory>" "<private-output-directory>" --send-one-request
```

Use a clean separate Git checkout. Keep the case, `.env`, credentials, and result outside Git. Share only the resulting `test-result.PRIVATE.json` through an appropriate private channel; it contains the source and job. The runner is for testing; it does not install or validate the complete Windows import-to-PDF workflow. An error is not permission to retry. On success, inspect the model text and compiled result for accuracy, limitations, relevance, writing quality, and source preservation.
