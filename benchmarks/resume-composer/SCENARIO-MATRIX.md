# Tailoring scenario matrix

This is a development and review plan, not a quality certification. No finite
matrix covers every CV or job description. The checks below exercise fictional
fixtures, source binding, compiler rules and mocked application requests; they do
not establish that a model follows the instructions or writes a good resume.

## Current offline coverage

| Dimension | Representative cases | What the tests establish | Important limit |
| --- | --- | --- | --- |
| Different target jobs | Same source, backend vs training (`tests/paired-offline-tailoring.test.cjs`; benchmark C01/C04) | Two manually prepared outputs can retain different justified emphases | They are not model-written outputs or proof of job relevance |
| Sparse and qualification-only CVs | One contribution, ongoing degree, skill-only source (`tests/adaptive-summary-authoring.test.cjs`) | Single-fact and qualification-only examples can compile; locks and source boundaries remain | Prompt compliance and semantic truth are untested |
| Attribution and limits | Multiple employers (benchmark C05), supervision, planned work, negation (`tests/scope-safety-audit.test.cjs`, `tests/planned-work-scope.test.cjs`, `tests/arabic-negation-scenarios.test.cjs`) | Certain incorrect citations and narrow literal English and Arabic scope changes are restored or flagged | Many paraphrases and cross-claim implications remain undetected |
| Metrics | Reversed English and Arabic numeric ranges, invented Western and Arabic-Indic digits, projects, summaries and locks (`tests/metric-direction-scenarios.test.cjs`, `tests/multilingual-numeric-grounding.test.cjs`) | Narrow endpoint-reversal and cited numeric-token signals restore or remove affected generated text | They do not verify units, causality, measurement context, written numbers or every format and language |
| Arabic | Fictional Arabic source and job (benchmark C06); selected Arabic numeric-range and negation examples | Text fixtures and narrow numeric and negation signals can be exercised offline | This is not general Arabic semantic, import, rendering or PDF validation |
| Relevant skills | Exact native skill, level, duplicate, negation and locks (`tests/explicit-skill-coverage.test.cjs`, `tests/symbol-skill-coverage.test.cjs`) | Some literal job mentions can retain an omitted native skill without creating experience | A literal match is not proof of relevance, proficiency or employer use |
| Locks, persistence and app | Mocked provider, original copy, review and reload (`tests/browser/`) | Selected end-to-end app paths work without contacting a provider | A mocked response says nothing about actual model behavior |
| Import/export | Synthetic PDF and DOCX browser smoke tests (`tests/browser/import-smoke.spec.cjs`) | The particular fixtures can be imported, edited and exported | Not representative of every layout, scan, language or PDF renderer |
| Hostile job text | Fictional job-instruction example (benchmark C07) | An adversarial case exists for review | The model's resistance to prompt injection is not established offline |

## Expand deliberately

For each new risk, add both a failure-triggering example and a nearby valid
example that must remain editable. Include, as applicable:

- Entry-level, career-change, volunteer, academic, multi-employer and senior CVs;
  a short source, a long source, and no supported match.
- The same source paired with different jobs; unrelated, contradictory,
  optional or negated requirements; and a job containing adversarial text.
- Attribution, dates, roles, education in progress, qualifications, supervision,
  negatives, planned vs completed work, metrics and measurement environment.
- English and Arabic text, mixed scripts and digits, and other languages or
  formats as explicitly supported; do not infer OCR or RTL PDF support from text.
- Empty and locked sections, duplicates, multi-source sentences, reordered and
  omitted material, failed requests, and independent edits surviving a fallback.
- Clear original wording and legitimate paraphrases, to measure over-rejection
  as well as missed risks. Check the editable copy and preserve the original.

Record unsupported forms and counterexamples as limitations, not passes. For
example, the current numeric-range check does not cover arrow notation or all
languages; matching digits alone does not preserve their units or meaning. Numeric token matching recognizes Western, Arabic-Indic and Eastern Arabic-Indic digits with selected separators, not every script, format or written number. Most
scope signals are English-only; Arabic negation coverage is limited and can
miss colloquial forms such as some uses of ما or reject valid paraphrases. A source citation is traceability, not proof.

## Evaluation and review

Prepare and evaluate the fictional benchmark with `tools/compose-benchmark.cjs`
as described in `README-AR.md`. Keep expected answers separate from authoring
inputs. A reviewer should check factual scope and attribution, actual job focus,
important omissions, clarity and document coherence against source evidence.
A material false claim is a blocking finding, not something a favorable score
elsewhere can offset. Keep `semanticStatus` unassessed until review; test
success, token overlap and successful compilation are not quality verdicts.

Before any real provider evaluation, obtain explicit approval identifying the
fictional or private data, model and settings, maximum number of requests and
stop conditions. Do not send a private CV, job or result, make billable calls,
retry or fall back to a different model under a vague approval. Keep private
inputs and results outside the repository. Document the model, exact input,
output and independent review for that case; a pass applies only to that case.
