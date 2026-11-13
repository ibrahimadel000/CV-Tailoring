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


## Mobile comparison space

On a smaller screen, opening the experience/project comparison temporarily hides the idle tailoring footer, leaving more space for review. Opening from a note also collapses the note, which can otherwise consume most of a short screen; it remains available to reopen. Closing the comparison or its parent restores the complete footer and unchanged sending/privacy disclosures. The footer and cancellation remain available throughout an in-flight request. Desktop retains the footer while comparing. The comparison still uses current source/copy state, not a generation-time snapshot, and does not judge factual accuracy.

## Current entry metadata review

The current comparison previously omitted experience location and dates and project links, even though either resume may have been edited after tailoring. A fictional offline browser regression reproduces this blind spot by changing the saved copy independently of its source. The comparison now displays labeled experience title, organization, location, start/end dates and overview, and project name, role and link on both sides. Empty fields are labeled “Not provided”; values are shown as text, not verified or automatically judged, and the view does not edit either resume. Bullet labels remain exact-text, entry-local comparisons only. This exposes current metadata for human review; it is not a generation-time audit and does not cover other sections.

## Conservative pagination experiment

A fictional coordinator CV with 15 short work bullets, six education entries and 12 certifications produced three A4 pages under automatic whole-section grouping. Splitting education into groups of three on each page yielded two pages with a continued heading, without changing content, font size or spacing. The app now tests a measured alternate layout only for three-or-more-page documents with eligible short multi-entry sections and no explicit layout choices. It uses the alternate only if it saves pages, continuation points stabilize, and a newly split previously intact section has at least two entry starts on each page. Missing measurements, unstable headings, failed alternate rendering or no page saving fall back to the original layout. Manual section and entry choices remain untouched. The PDF preview and export share the selected render.

This deliberately narrow optimization may take extra PDF renders and does not guarantee ideal pagination or solve every mostly empty last page. In particular, a two-page document with a short final certification section is unchanged; splitting that section would not by itself remove a page and may create an orphan. Tested PDF text and page bounds were checked for fictional examples; visual inspection and finite tests do not prove that every layout is free of clipping or orphaned content. Non-Latin PDF limitations remain unchanged.

## Action–object and outcome relationship diagnostic

The active single-draft instructions previously encouraged moving a coordination clause ahead of an alignment action and illustrated it by changing “aligned clinic schedules with laboratory maintenance” into “coordinated laboratory maintenance”. That can attribute maintenance coordination not established by the source. A second example changed a stated coordination result into a purpose. The old summary illustration also asserted maintenance coordination. These are risks in the instructions, not evidence that a live provider followed them. An earlier offline test described similar authored rewrites as clean; its examples and title have been corrected rather than used as evidence of factual accuracy.

The active instructions now preserve action, actor, object, attribution and result-versus-purpose relationships, avoid the risky examples, and retain a clear original when a rewrite would change meaning. This does not change the local factual guards or prove that any provider will follow the revised instructions. No live provider request or independent professional review has been performed.

Run `node scripts/factual-relations-baseline.cjs > factual-relations.json` for six fictional paired, author-written examples across healthcare, administration, heritage, education and hospitality, including Arabic. On this checkpoint, all six intended faithful edits were retained without notes, and all six risky authored edits were also retained without notes. These small, related development probes are neither model outputs nor a representative safety rate; they reveal a remaining local-guard blind spot. The related preview and bullet comparison can help a user inspect wording but do not certify it. A separately designed, independently reviewed holdout and explicitly approved live evaluation are needed before judging provider impact or broader safety.

### Fictional one-request live smoke test (prepared, not run)

`scripts/fictional-live-case.cjs` creates a fixed fictional clinic-scheduler case outside the repository without networking. Its professional input is a 2022–2025 clinic-scheduler role at a fictional clinic with two source bullets: aligning clinic schedules with laboratory maintenance through planning and cross-team coordination, and preparing appointment updates for the nursing team. The fictional job requests scheduling and communications with nursing and maintenance teams; facility maintenance management is preferred. This deliberately tests whether a job preference is mistaken for candidate evidence or scheduling around maintenance is promoted into managing maintenance. The request also includes the active system instructions, JSON schema, structured source IDs and reference policy. No real CV or contact details are sent.

The existing manually invoked `scripts/evaluate-single-draft.cjs` has an explicit `--model=gemini-3.8-flash` mode using 24,576 maximum output tokens and low thinking, matching the primary application's model settings. Unlike the app's automatic fallback path, this evaluation makes at most one request and never retries or falls back. It stops on network, provider, restriction, incomplete and invalid-output errors. Its output is stored outside the repo and captures the requested model, provider-reported version when available, validated token counts when available, hashes, proposal, retained text and review notes. It does not grade semantic truth; manual review is still required. The older default evaluation mode remains unchanged. This is one smoke test, not a benchmark or a complete app/PDF test. The fixture and runner were tested only with mocked network calls. Obtain specific approval of the data, model, settings and one-request budget before running; never commit keys or real personal data.

After the first user-run attempt failed immediately without a usable response, the runner was updated to validate that a key can be used in a request header before networking and to distinguish timeouts and allowlisted connection error codes without printing raw errors or credentials. A successful basic HTTPS POST to Google's root does not establish that the model endpoint will succeed. These diagnostics do not establish whether the earlier attempt reached Google, and the previous one-request budget must not be reused.

### Review access for changed entries

The relationship probes show that an unsafe paraphrase can survive without a local note. A changed experience/project entry now receives one neutral, dismissible review reminder when there are no existing content notes, with a direct link to the current source-versus-copy comparison. This is deliberately based on generation-time change metadata, not a semantic risk classifier: both a faithful paraphrase and an unsafe one receive the same reminder. Reordering alone does not trigger it; the comparison may reflect later edits, and an unavailable source cannot be compared. The reminder does not block export, alter the copy, prove factual accuracy, or repair the unresolved guard blind spot. Offline browser cases exercise a fictional relationship change, a faithful rewrite, reload, small-screen access, a missing source, unchanged original and PDF exclusion of the reminder. An initial 320×568 layout left too little comparison space; the compact revision passed the focused viewport check.
