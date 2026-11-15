# Storage WIP: offline test adaptation and open blockers

This is research on top of `wip/storage-isolation-20261115`, not a release candidate. Do not merge, deploy, or use for important resume data. The canonical-store test adaptation is a patch, not already applied to the tests on this branch.

## Apply in a disposable checkout

Starting from this branch, apply the historical test patch first, then the storage adaptation:

```sh
git apply benchmarks/SC1-HISTORICAL-REVIEW-WIP.patch
git apply benchmarks/STORAGE-BROWSER-ADAPTATION-WIP.patch
```

These affect only fictional offline browser fixtures/tests. The fixture clones independently stored values separately to avoid fabricating cross-key aliases, and the quota test targets the actual canonical write. No assertions for usable mobile comparison height were weakened. Patch application was checked against the saved e69b644 baseline; the resulting six files matched the corrected working files apart from an extra final blank line in one file. Do not apply the separate combined SC1 patch on top of these.

## Results and limitations

A five-file adapted browser run, excluding migration, had 93/100 pass on an **unpublished experimental Blob patch**, not on this branch: six failed the mobile comparison viewport height assertion and one had a stale quota injector. After fixing the injector, three focused tests passed, including quota/retry and fixture isolation. The initial reported multi-citation save failure was a fixture alias artifact and passed when corrected. The full five-file run was not rerun after the injector fix and does not establish safety of this branch.

The unpushed Blob patch was withdrawn. Independent probes showed JSON-cloned newly created copies could lose opaque data before storage saw them, and generic deletion authorization was too broad; other unusual shared graphs caused legitimate operations to fail. The branch still deliberately rejects Blob and other unsupported values rather than safely supporting them. Existing JSON cloning and JSON freshness checks in composition and related services mean a storage-only patch cannot guarantee preservation. Comparison removal needs operation-specific, revision-bound authorization, not an exception based solely on property names. Shared aliases, migration, backup and legacy divergence remain open. Design and test an end-to-end authoritative graph and operation boundary before relaxing restrictions.

The WIP storage notice consumes significant mobile space. Six existing tests failed on the unpublished pre-fix code, with clientHeight 40–124px at 320×568; hiding the notice solely in a diagnostic increased it to 168–261px. A separate proposed minimum-height/shell-scroll fix passed those height assertions but was withdrawn after independent review: the panel could still be outside the visible viewport, nested scrolling could strand controls, and the mobile source-paragraph rule hides the comparison-storage explanation. On the restored layout, a separate diagnostic observed only 59.5px of comparison visibly exposed at 320×568 and 130px at 667×500. Keyboard cancellation worked in one busy 320×568 case; touch access was not established. Design and validate actual viewport visibility, disclosure, scrolling, focus and cancellation together; do not remove disclosure or weaken assertions.

An interrupted full browser run is not a final suite. 1,441 offline unit tests and a build passed in the working copy during the mobile experiment, but the build was not verified against a frozen final CSS state. No provider call was made. Test outcomes do not prove live model accuracy, full mobile usability or data preservation. See `TAILORING-CONTRAST.md` on the separate quality-research branch for the author-labeled paired diagnostic; it is not present on this branch.
