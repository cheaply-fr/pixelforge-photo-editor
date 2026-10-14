# Select Linked Layers contract

`Layer → Select Linked Layers` selects every embedded smart-object instance
whose persisted `linkId` matches any currently selected linked smart object.
It changes only `selectedLayerIds`; the active layer, transforms, masks, source
assets, and rendered pixels stay unchanged. Multiple selected link groups are
unioned in document stack order.

The command is local and source-safe. It is disabled when there is no selected
linked smart object, fails closed for stale selections, is undoable through the
normal document history, and survives project export/import and reload. This
does not create external file links or claim Photoshop's provider-backed linked
asset synchronization semantics.

Pure coverage is in `tests/linked-layers.test.mjs`; desktop/mobile menu,
selection, pixel, undo and project round-trip coverage is in
`tests/browser/smart-objects.spec.ts`.
