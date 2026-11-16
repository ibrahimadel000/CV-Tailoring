# Trust Gate v1

Trust Gate v1 is an offline, privacy-safe technical integrity harness for the tailoring pipeline. It is designed to show **where evidence moved through the pipeline** without printing resume text, job text, provider payloads, prompts, secrets, or retained wording.

It is not an AI score, factuality certification, job-fit guarantee, semantic verifier, or release approval.

## Run

From a checkout with dependencies installed:

```text
node tests/trust-gate-v1.test.cjs
node scripts/trust-gate-v1.cjs > trust-gate-v1.json
```

The test executes the existing fictional development fixtures:

- `scripts/product-quality-baseline.cjs`
- `scripts/factual-relations-baseline.cjs`
- `scripts/relationship-risk-probes.cjs`

All fixture responses are hand-authored offline cases. The harness installs a network tripwire while each set runs and records only metadata: counts, hashes, lengths, paths, statuses and labels.

## Contract

Every trace identifies:

1. The fixture set, fictional case, occupation, language and variant.
2. Source, job, proposal and retained-text lengths plus SHA-256 digests.
3. Whether a provider was called and the request fixture hashes.
4. Compiler status, warning count and bounded warning paths.
5. `semanticStatus: "unassessed"`.

The top-level report also records:

- Development-set coverage by case, occupation and language.
- Whether a network call occurred.
- Whether a provider call occurred.
- Whether the separate frozen holdout exists.
- Whether preview/export parity is implemented.
- The decision `review_required` when technical execution succeeds.

A technically successful run is therefore **not** a quality pass. It is evidence that the offline fixtures executed without a provider or network call and that a redacted trace was produced.

## Required follow-up gates

Before calling this a production candidate, add and independently review:

- A separate frozen holdout that is not used to tune prompts or guards.
- Explicit labels and review for unsupported facts, ownership, scope, dates, numbers, outcomes, omissions, relevance, false rejection and clarity.
- Source-to-preview/PDF parity checks, including pagination and mixed-script cases.
- Human review of representative cases; AI grading alone is insufficient.
- Tenant-scoped storage, consent, retention, deletion, export and recovery tests.
- Full unit, browser and build checks on the exact branch under review.

Until those exist, keep the quality decision `not_evaluated` and do not use words such as `perfect`, `verified`, `guaranteed`, or `safe for every CV` for the product.
