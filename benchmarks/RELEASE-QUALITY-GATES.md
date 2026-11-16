# CV Tailor — Release Quality Gates

This document defines evidence required before calling a CV Tailor increment professional, production-ready, or launch-ready. Passing a finite suite never proves perfect factual safety, universal job fit, provider availability, or quality for every resume.

## 1. Grounded candidate representation

**Must be true**

- Work, projects, skills, education, certifications, dates, actors, qualifications, negations and limits remain distinguishable in the provider projection.
- A listed skill is not silently promoted into employer experience, proficiency, ownership or an outcome.
- Ambiguous extraction is preserved for user review rather than guessed.
- Locked content and the original resume remain unchanged.

**Evidence required**

- Fictional cases across healthcare, education, trades, finance, hospitality, administration, engineering and creative work.
- English, Arabic and mixed-language cases.
- Cases with incomplete degrees, supervision, negation, metrics, dates, sparse evidence and conflicting structure.
- Positive cases showing useful supported synthesis and negative cases showing unsupported claims, attribution changes, scope changes and omissions.

## 2. Job relevance without job-to-candidate leakage

**Must be true**

- The job description is treated as a vacancy, not as evidence about the candidate.
- Strong supported evidence is emphasized for the target role, including nontechnical roles.
- Missing requirements remain missing or are presented as optional evidence questions; they are not invented.
- Keyword overlap alone does not determine relevance or skill selection.

**Evidence required**

- Preregistered or frozen cases with expected material job needs and candidate evidence.
- Separate assessment of relevance, coverage and unsupported additions.
- Human review by profession where feasible; AI grading alone is insufficient.

## 3. Professional writing and user control

**Must be true**

- The result is concise, specific, readable and non-repetitive without adding unsupported polish.
- Changes are visible and understandable.
- Users can compare source and copy, restore or edit content, review selected skills and inspect qualifications.
- Review notices are honest warnings, not claims of certification.

**Evidence required**

- Human review of faithful rewrites, useful unchanged results, false rejections and missed risks.
- Mobile and desktop checks for review access, cancellation, keyboard use and touch reachability.
- No requirement to accept AI wording in order to export.

## 4. Document and export integrity

**Must be true**

- Editor, preview, saved copy and exported PDF contain the same reviewed content.
- Dates, headings, qualifications and links are not clipped, orphaned or silently removed.
- Layout improvements do not shrink text excessively or delete content to reduce page count.
- Mixed scripts and supported right-to-left content are tested explicitly.

**Evidence required**

- Short, long, sparse, dense, two-page and multi-page fictional documents.
- Visual inspection in addition to text and bounding-box checks.
- Preview/export comparison after user edits and after tailoring.

## 5. Reliability, cancellation and provider safety

**Must be true**

- Connection, headers, response-body reads, JSON parsing, fallback delay and late results have bounded behavior.
- A timeout or cancellation leaves the UI in a terminal state and cannot create a late copy or trigger an unintended fallback.
- The product distinguishes local cancellation from unknown provider processing.
- Retry and fallback counts are explicit; no blind retry follows an ambiguous request.
- Response bodies and diagnostics are size-bounded and do not expose prompts, resumes, keys or raw provider errors.

**Evidence required**

- Offline tests for cooperative and uncooperative fetches, streams, JSON parsing, browser resume and late success/error.
- Clean-checkout unit, browser and build runs on the exact candidate commit.
- A bounded, explicitly approved live test only when provider, data, model, request count, retry policy and stop rules are documented.

## 6. Privacy, security and data boundaries

**Must be true**

- No private resume, job description, output, credential or contact detail is committed to code, tests, logs or reports.
- Provider input is minimized and disclosed.
- Local history, review snapshots and diagnostics have a documented retention and deletion behavior.
- Secrets are never requested in chat, printed in errors or embedded in client production builds.

**Evidence required**

- Secret scanning where available, plus manual review of changed files and fixtures.
- Synthetic fixtures for public tests.
- Explicit review of provider, storage, export and deletion boundaries before launch.

## 7. Cost, billing and operations

**Must be true**

- The UI discloses possible fallback requests and charges.
- Request counts, status, model identifiers and token usage are distinguishable from cost estimates.
- Timeouts do not silently trigger duplicate billable attempts.
- Quotas, rate limits, support diagnostics and incident evidence are observable without retaining sensitive content.

**Evidence required**

- Mocked retry/fallback matrix.
- Provider-side reconciliation for any approved live test.
- A documented support path for failed, delayed, partially processed and charged requests.

## Release decision format

Every candidate should be labeled one of:

- **Development-only:** fictional/offline evidence; not suitable for user data.
- **Review candidate:** focused tests pass, known gaps documented, no merge or deployment implied.
- **User acceptance candidate:** clean-checkout regressions pass and controlled user workflows are ready.
- **Production candidate:** privacy, cost, operations, deployment and rollback evidence are complete.
- **Launch candidate:** production candidate plus observed user value, support readiness and a rollback plan.

Never use “perfect,” “factually verified,” “guaranteed,” or “safe for every CV” as a test result. State what was tested, what was not tested, the exact commit, the evidence type, and the remaining risks.
