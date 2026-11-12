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

## Appended-wording review increment

A narrow local signal now asks the user to compare a surviving experience/project bullet with its original when the bullet starts with a single cited passage (four or more word/number tokens) and appends a token absent from that passage. It compares literal normalized tokens; it never modifies or rejects the bullet, never judges truth, and excludes multi-source synthesis. The note is recorded only when the line survives later restoration, persists with the copy, and is not exported in the PDF. Users must review and edit the copy; the flagged wording remains in the resume and will appear in the PDF unless changed.

Re-running the same 24 fictional cases after this change: all six copies and six intended faithful rewrites still remained without notes; all six obvious-risk cases were restored with notes; and the five subtle-detail examples previously retained without notes now remain with a review note. The sixth subtle case was already restored. This is a small development set, not an estimate of general effectiveness. A separate small set probes other English, French and Arabic literal examples; it is not an independently reviewed validation set.

Limitations: the signal misses inserted details, paraphrased prefixes, short source passages, multi-citation lines, many phrases in unspaced scripts and other unsupported changes. Conversely, harmless appended wording can receive a note, and a missing note does not imply correctness. No model, data contract, retry policy or factual blocking rule changed. Prioritize a broader, independently reviewed evaluation and more actionable claim-by-claim comparison before making stronger safety claims.

## Making review actionable

On a tailored copy with notes and an available source, the notes offer **Compare experience and projects**. It switches to the tailoring pane, opens the live experience/project comparison and focuses its heading, including on mobile. The comparison now labels text without an exact counterpart on both sides. Entry matching still uses unique native IDs; it does not guess which bullet corresponds to which. These labels are literal and presence-based, not proof that a claim is supported or missing. Both resumes may have been edited since tailoring. If the source is no longer available, the shortcut is omitted rather than displaying a false comparison. The user can edit the tailored copy in the regular editor.
