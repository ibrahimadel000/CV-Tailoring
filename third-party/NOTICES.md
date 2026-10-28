# Third-party code used by CV Tailor

## Reactive Resume — MIT, Copyright (c) 2026 Amruth Pillai
Commit: 44929ad102d382588eea8ed87d943e385fb9cf80
- packages/resume/src/proposals.ts → src/vendor/reactive-resume/proposals.ts:
  canApplyTo/applyTo extracted and types adapted to plain text. Used by
  composer/protocol.ts to reject stale/ambiguous passage replacements.
- packages/ai/src/prompts/assistant-system.md → src/vendor/reactive-resume/assistant.ts:
  retained as a historical reference. B25 does NOT import it into the active
  writer; it uses one dedicated source-first JSON writing instruction.
- Exact upstream MIT notice: reactive-resume-MIT.txt (unchanged).

## JaimeYeung/Resume-Tailor-AI — MIT declared in README
Commit: f3c2c327c7f4deb1ae4fbbd4389f879b2e225d83
- lib/types.ts → src/vendor/resume-tailor-ai/types.ts: FactBank and related
  professional types are still used by composer/factBank.ts.
- lib/prompts.ts buildJDReportPrompt → src/vendor/resume-tailor-ai/jobAnalysis.ts:
  retained as a historical reference. It is no longer concatenated into the
  B25 writer prompt, which has a single output contract.
- License declaration and permission text: resume-tailor-ai-license.md (unchanged).

## B25 local architecture
Source-first prompt + source passages + full job + app-owned job inventory
→ one provider response → checked proposals → app-owned coverage → selected
reviewed copy. Missing assessment rows are not classified as candidate gaps.
Local checks are structural and narrow regression checks, not factual/semantic
verification of every claim. Source CV content is accepted as user-provided truth.

No new application dependencies. Builder/import/PDF engines are unchanged.
The import geometry notice in the root THIRD_PARTY_NOTICES.md is unchanged.
