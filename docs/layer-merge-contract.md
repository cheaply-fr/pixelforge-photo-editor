# Merge Layers contract

`Layer → Merge Layers` combines the active layer with the immediately lower
layer in the frame stack. The first increment is deliberately bounded to two
visible, unlocked, ungrouped adjacent layers. A missing lower layer, a hidden
layer, a locked layer, or any folder membership disables the command; the
command handler reports the corresponding guard reason when invoked. Folder
members remain disabled pending a dedicated isolated-folder merge contract.

The pair is rendered through the normal document pipeline before replacement,
so transforms, opacity, blend mode, adjustments, styles, masks and local
retouch metadata contribute to the merged pixels. The result is one
frame-sized raster layer at the pair's stack position; it is visible,
unlocked, uses neutral editable metadata and becomes the active layer. Other
layers, including hidden layers, retain their order and properties. The
original raster assets are immutable and remain available through history.

Merging creates one undoable history frame. Undo and redo restore or reapply
the pair deterministically, and local draft reload plus `.pixelforge` project
round trips retain the merged raster and unaffected layers. The operation is
local-only and does not upload source pixels. Selection and unrelated frame
metadata remain unchanged.

Pure coverage in `tests/layer-merge.test.mjs` validates stack planning and all
guard reasons. Browser coverage exercises the Layer menu on desktop and
mobile, compares deterministic corner/centre RGBA samples with the pre-merge pair, verifies the
merged source asset and history round trip, and covers undo/redo, reload and
project export. Browser-level locked/hidden/folder interaction cases remain
the next test increment; their policy is already fail-closed in the pure
planner.
