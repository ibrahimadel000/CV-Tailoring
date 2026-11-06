# Gemini 3.8 bounded diagnostic

This evaluation-only script is not an app update. It makes at most three sequential requests, stops on the first error, and does not retry or fall back. Run it only with explicit approval. Requests can incur charges.

1. A tiny fixed prompt checks connectivity. No user's CV or job is sent.
2. A fictional test CV and fictional job use the same tailoring instructions and structured-output mechanism; source-specific schema options can differ from the real case. Its temporary files are deleted. If the response cannot be compiled locally, the script stops.
3. Only if both earlier checks succeed, the saved private case is sent to Google once. The result stays outside the repository and contains the private CV and job. Compilation alone does not prove accurate or useful writing.

The script uses the existing Vite development-mode key selection. It requires a clean separate Git checkout and checks private paths are outside that checkout. It does not install, alter browser storage, or change the original app. Each invocation can issue up to three new requests; the script has no one-shot marker. Do not rerun without a fresh agreement. Provider status is not a diagnosis of account usage or the reason for a failure.

```
node scripts/diagnose-gemini38.cjs <private-case.json> <env-directory> <private-output-directory> --send-up-to-three
```
