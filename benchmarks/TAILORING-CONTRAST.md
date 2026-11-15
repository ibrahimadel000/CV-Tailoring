# Fictional tailoring contrast diagnostic

This is an **offline, author-labeled development diagnostic**, not an independently reviewed holdout, model evaluation or estimate of live error rates. It exercises active single-draft preparation and `compileNaturalComposition` with fictional, hand-authored job/entry content and responses. No model request is made; the script accepts no CV, job or credentials as input and prints no environment values.

The standalone runner replaces `globalThis.fetch` before loading the application modules; the tests replace it during import and execution. **This blocks only fetch**, not `http`, `https`, sockets, child processes or other networking; it is not an OS network sandbox. The benchmark code itself makes no network calls. Inspect the code or run in an independently isolated environment to establish stronger network guarantees.

## Run and provenance

From the project copy with its existing dependencies:

```sh
node scripts/tailoring-contrast-benchmark.cjs > benchmarks/tailoring-contrast-results.json.tmp && mv benchmarks/tailoring-contrast-results.json.tmp benchmarks/tailoring-contrast-results.json
node --test tests/tailoring-contrast-benchmark.test.cjs tests/claim-guard.test.cjs tests/relationship-risk-probes.test.cjs tests/multilingual-numeric-grounding.test.cjs tests/numeric-unit-scope.test.cjs tests/multi-citation-coverage-review.test.cjs
```

Each case asserts the source profile remains unchanged; the request's job and full source equal the prepared packet; and every entry bullet ID uniquely resolves to its exact fictional source text, kind and parent. The report records each citation ID, index and source text, proposed and retained text, guard notes, compiler warnings and unassessed semantic status. It fingerprints the complete `src` tree, lockfile, benchmark script, benchmark test and two fixture/loader files, and records Node and TypeScript versions. It does **not** fingerprint installed dependency bytes, operating system or all environmental factors. The copy has no Git metadata; the claimed baseline commit is not independently verified.

The temporary-file command replaces the saved result only if the benchmark succeeds; inspect the change before committing. The snapshot test reruns the benchmark and compares the complete report and fingerprint to the saved JSON. On an implementation, harness or recorded-version change, review the changed observations and deliberately regenerate the snapshot; do not treat the snapshot as a requirement that risky text must keep passing. Exact retention is an observable, not a semantic verdict. A note is non-blocking and the text stays in the output. The authored classifications require independent review. The range's unchanged control and two source-combination controls are not counted as paraphrases, and the ambiguous wording and omission are not classified as unsupported assertions. No mixed-type aggregate score is presented.

## Per-case observations on this copy

“Retained” means the proposed line appeared exactly in the compiled entry; “restored” means it did not and a guard restoration was recorded. “Review” means a non-blocking guard notice. The left control and right contrast use the same cited source. Descriptions are authored interpretations, not verified factual labels.

| Case | Control | Contrast | Observed contrast concern |
| --- | --- | --- | --- |
| sql-verb | Supported paraphrase: restored | Unsupported employer: restored | New fictional organization. |
| sql-product | Supported paraphrase: retained | Ambiguous: restored | “Prepared SQL” might be a product name; that reading is not established. |
| sql-statements | Supported paraphrase: retained | Unsupported-technique diagnostic: restored | “Prepared SQL statements” can imply the specific prepared-statement technique, not established by the source; interpretation depends on context. |
| proper-name | Supported paraphrase: retained | Unsupported name: restored | New fictional library. |
| technical-name | Supported paraphrase: retained | Unsupported term: restored | Additional technology. |
| actor | Supported paraphrase: retained | Actor reversal: retained, no compiler warning | Changes who led lessons. |
| approval | Supported paraphrase: retained | Actor reversal: retained, no compiler warning | Changes who approved invoices. |
| count-swap | Supported paraphrase: retained | Quantity swap: retained, no compiler warning | Same counts, different activities. |
| metric-swap | Supported paraphrase: retained | Metric swap: retained, no compiler warning | Same percentages, different measures. |
| range-reversal | Unchanged control: retained | Range reversal: restored | Direction of endpoints changed. |
| observation | Supported paraphrase: retained | Changed responsibility: retained, no compiler warning | Observation promoted to installation. |
| arabic-actor | Supported paraphrase: retained | Actor change: retained, no compiler warning | Changes who led meetings. |
| arabic-counts | Supported paraphrase: retained | Quantity swap: retained, no compiler warning | Counts attached to different activities. |
| multi-omission | Faithful combination: retained, review | Omission: retained, review | Two cited facts, one contribution omitted. |
| multi-actor | Faithful combination: retained, review | Changed action: retained, review | Reporting repair issues promoted to repairing. |

The faithful multi-omission control retains “patient” and uses a semicolon to preserve the separate scope of the nursing-team qualifier. The combined controls are not treated as paraphrases. These cases do not exercise the UI's separate neutral change reminder.

## Why no production guard change

For `sql-verb`, the compiler restored “Prepared SQL reports for weekly sales reviews.” from “Produced reports with SQL for weekly sales reviews,” identifying “Prepared SQL” as absent. In `terms.ts`, consecutive capitalized words are treated as a phrase; `claimGuard.ts` restores when such a phrase is absent. This fictional reproduction is not a claim about a real user's output.

The report's `termOnlyCounterfactual` uses an in-memory copy of the term extractor with “prepared” added as a sentence-initial verb. It removes the term signal on the faithful paraphrase, on the **ambiguous** product-name lookalike, and on the prepared-statement technique diagnostic. The latter shows a concrete potential cost of the exception under the technical reading; it does not prove which meaning an author intended. This experiment changes only the extractor, not the compiler, and does not establish full-pipeline behavior under that change. Generic capitalization and token-order heuristics cannot reliably determine context, proper names, technique, actor or numerical relationships. Restoring supported prose also harms tailoring quality. No production guard, prompt, provider behavior or UI was changed.

For stronger evidence, separately author and independently review a frozen holdout with supported and unsupported examples, multi-source omissions, diverse professions and languages, proper names, metrics and actor relations. Measure false rejection separately from unsupported exact retention and non-blocking review notices. Include end-to-end copy/export and human assessment of usefulness; obtain explicit approval before any live provider testing. This entry-only diagnostic does not test summaries, projects, skills, job relevance, writing quality, all locales or the complete UI/export flow. Source-wording mode and comparison reminders are review aids, not factual verification.
