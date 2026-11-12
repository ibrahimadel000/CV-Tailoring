# Active-path product-quality baseline

This is an offline diagnostic using entirely fictional profiles and hand-authored responses. It exercises `prepareNaturalComposition`, the single-draft request preparation, and `compileNaturalComposition`. It does not call a model or establish what a model would produce. It complements the existing resume-composer benchmark, which exercises a different composition path.

Run from the repository root after `npm ci --ignore-scripts --no-audit --no-fund`:

```sh
node --test tests/active-quality-baseline.test.cjs tests/skill-grouping-trace-baseline.test.cjs
node scripts/product-quality-baseline.cjs > quality-baseline.json
```

The report includes source facts, the fictional job, proposed and retained text, review notes and request hashes. Compare each case manually: citation, matching words and successful compilation do not prove factual support, attribution or useful writing. The hash identifies the prompt/request representation; it does not evaluate quality. Fixtures labeled faithful or risky express the author's intended comparison, not a semantic judgment by the script.

## Initial observations

On the code at `62e3095d9542056ab6f7f29aefdc9a0e4639423c`, the expanded diagnostic produced 24 responses across six occupations, including one Arabic case:

- Six unchanged copies and six intended faithful rewrites were retained without notes.
- Six obvious scope-risk rewrites were restored with notes.
- Of six subtle unsupported-detail proposals, five were retained without notes: an intensive care setting, students with disabilities, commercial buildings, API deployment and confidential documents. The VIP-guest proposal was restored with a note.

These are authored probes, not real provider outputs or population estimates. Their purpose is to expose limited guard coverage and help prevent regressions, not to claim the retained wording is safe. The current tests intentionally do not require an unsafe line to remain accepted; a later improvement can change that outcome.

## Next investigation

Develop a broader reviewed set including faithful and unsupported paraphrases, cross-entry attribution, skills versus demonstrated work, qualifications and Arabic. Trace candidate safeguards through the actual authoring and compiler pipeline, measure unnecessary restorations as well as missed claims, and preserve originals and locks. Avoid adding keyword-specific rules merely to pass these fixtures. Any live provider experiment requires a separate explicit case, model, request, retry and stop budget approval.
