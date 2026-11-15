# Historical review prototype — work in progress

**Do not merge, deploy, or use with important resume data.** This branch is a research prototype, not a release. See the current Notion product-quality handoff for context.

## Intent and scope

The prototype preserves an optional local comparison of source and final compiled summary, experience, and projects at generation time. It shows both sides independently; it does not prove attribution, meaning, or factual accuracy, and it does not change the model or semantic guards. The snapshot can retain sensitive professional text. Contact/link detection is incomplete, logical removal is not secure erasure, and other copies or backups can retain text. The user can opt out before generation and remove a saved comparison. Project link fields are excluded; overly large or some detected link/contact-bearing snapshots are skipped rather than truncated.

## Known release blockers

1. An already-open **older app version** writes the legacy IndexedDB keys without the new compare-and-swap checks. If it writes after the updated version removes a comparison, it can restore that comparison or overwrite newer work. The warnings in this prototype do not prevent that. Do not claim cross-version safety.
2. Some unsupported structured-clone values such as `Map` in preserved unknown metadata compare unequal even when unchanged. This can block all saves and removal. The JSON recovery download is not lossless for `Map`, cycles, and other values and is not available for every ordinary save failure. Never represent it as a complete backup.
3. Saving conflicts retain unsaved work only in the open tab and require manual reconciliation; browser shutdown can lose it. Storage failures, migration and rollback need broader real-browser testing.

An independent design proposal is to isolate new writes in a new IndexedDB object store, explicitly handle blocked upgrades and legacy-store retention, use transactional revision checks among new writers, and implement verified recovery for a defined set of structured-clone types. This proposal has not been implemented or validated. Legacy tabs that reopen can still save separately to the old store; their changes require reconciliation, and legacy copies of sensitive data require explicit cleanup. Test migration races, rollback, blocked upgrades, old writers, two new writers, deletion, quota errors, supported metadata and recovery round trips before release.

## Outstanding product quality risks

Independent fictional probes showed that a proposed rewrite can swap the percentages assigned to two outcomes without a guard note, while a supported `Prepared SQL` rewrite can be restored by an overbroad phrase check. These are isolated diagnostic cases, not production error rates. The comparison helps a person review but does not detect or correct these errors. PDF two-page whitespace and real-model quality remain open. No live model calls were made for this prototype.
