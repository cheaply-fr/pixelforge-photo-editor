# Merge Layers contract

`Layer → Merge Layers` combines either the active layer with the immediately
lower layer or the persisted multi-layer selection. The pair path is bounded
to two visible, unlocked, ungrouped adjacent layers. The selected-set path
requires at least two visible and unlocked layers: root-level layers must be
contiguous, while selecting any folder member expands to the complete visible,
unlocked folder and merges its isolated surface as one unit. Mixed folder/root,
missing, hidden, locked, non-contiguous, insufficient, or partially referenced
artboard selections disable the command with an explicit guard reason.

The selected pair, contiguous root-level range, or complete folder is rendered
through the normal document pipeline before replacement, so transforms,
opacity, blend mode, adjustments, styles, masks and local retouch metadata
contribute to the merged pixels. The result is one frame-sized raster layer at
the range's lowest stack position; folder merges retain the folder ID so its
opacity/blend is applied exactly once. The result is visible, unlocked, uses
neutral editable metadata and becomes the active layer. Other layers,
including hidden layers, retain their order and properties. The original
raster assets are immutable and remain available through history.

Merging creates one undoable history frame. Undo and redo restore or reapply
the selected range deterministically, and local draft reload plus `.pixelforge`
project round trips retain the merged raster and unaffected layers. Artboards
that reference every merged source replace those IDs with the composite. A
partial artboard selection is rejected before rendering so a full-frame
composite cannot leak into an unrelated viewport. The operation is local-only
and does not upload source pixels.

Pure coverage in `tests/layer-merge.test.mjs` validates pair, selected-range
and isolated-folder planning, canonical stack ordering, all guard reasons,
immutable application, group preservation and artboard safety. Browser
coverage exercises the Layer menu on desktop and mobile, compares deterministic
RGBA samples, verifies source retention and history round trips, and covers
undo/redo, reload, project export, grouped merge and non-contiguous selection
disabling.
