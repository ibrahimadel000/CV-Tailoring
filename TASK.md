# Current task — SC3 focused summary candidate

Approved: improve summary authoring through a real reversible application preview, one bounded outcome. Branch:preview/sc3-summary-focus from SC2@e2a34be9f784aefd13b96b588aca630d6eb9f2a3; focused PR targets preview/sc2-flash-lite, not main.

Implementation: more specific narrative-led summary guidance plus visible SC3 label. Same Flash-Lite model/settings and one-call behavior. No evidence-boundary relaxation, skill-to-practice promotion, app replacement, editor/import/export changes, dependencies or private user data in tests/code. Earlier conversational skills-sentence suggestion is not implemented because it conflicts with the existing deliberate summary boundary.

Acceptance: full unit suite plus explicit static-policy and manually authored native-compiler regression cases, four mocked real-browser cases and production build. Review exact runtime diff. Deliver PR, changed files, prompt hash/settings, limitations and guarded PowerShell backup/apply/version-check/rollback guide.

Current:795/795 unit tests,4/4 mocked browser tests and production build passed; existing bundle warning only. Runtime diff reviewed: two instruction paragraphs plus visible label. SC3 not installed or writing-accepted. No live calls allowed. After delivery and local version check, agree a new finite trial before testing actual writing; all prior budgets are closed. Keep pagination outside this bounded change.
