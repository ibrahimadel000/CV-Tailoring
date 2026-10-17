# Batch 12 — Design / preview independent scrolling

## Scope
Three source files, no dependency/package/environment/persistence/schema change. Design is a labelled non-modal aside in the existing workspace. Editor remains mounted while hidden. Preview remains the same mounted scroll region. Other dialogs still use showModal. The existing preview container now has region semantics and tabindex=0 for native keyboard scrolling.

## Verification
- Desktop native wheel scroll works before and during Design. Wheel over Design scrolls its own body without moving preview; wheel over preview leaves Design position unchanged.
- Opening Design and color-only PDF updates retain preview scroll. Template updates remain live. Zoom/Fit usable while Design remains open.
- Native CDP touch scroll in both areas at 390x844; color updates retain mobile preview position; subsequent touch scrolling works.
- Design is not an open modal dialog. Escape/Done/X close it and focus returns to its trigger. PageDown scrolls focused preview. Nested actual PDF modal Escape does not also close Design.
- Existing editor input DOM identity and edited name survive Design open/close. Preview heading returns to actual section editor. Mobile Edit returns to editor.
- Viewport widths 320,390,768,900,901,1024,1440,1920 tested. Short layout 844x390,640x360 and320x568 checked for usable scroll areas, no pane intersections and no document overflow.
- Existing PDF regression passes: 2→4→2 pages, identical preview/export PDF hashes, selectable text, section anchors, typed sections, safe non-Latin fallback, mobile autosave/reload. Theme state isolation/migration/title clearing tests pass. Photo suite passes (local file validation/crop/hide/show/reload/templates/export/clone isolation). Live-card drag suite passes including form identity, keyboard, cancellation, touch and persistence.
- One first drag harness run under concurrent build/browser load checked before collapse animations settled; isolated rerun waits for geometry to settle and passes same-node assertion. First concurrent build exited137; sequential final build passes. Existing eval/large-chunk warnings remain.
- Production bundle tested: Design independent wheel, color update, local PDF worker, photo PDF export, no request failures or unhandled page errors.
- Individual desktop, mobile Design top/color states, landscape and independent frozen-HTML screenshot inspected. Frozen HTML selects have selected attributes restored from actual current settings. Helper diagnostics: no viewport overflow, overlay intersections, exceptions or failed resources.

## Limits
Linux Chromium / emulated touch only, not physical devices or Safari/Firefox testing. Windows installer scripts hash/replay reviewed, not executed on Windows here. PDF font and browser-local storage limitations unchanged. This fix does not add CV Tailor.
