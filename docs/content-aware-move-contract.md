# Content-Aware Move contract

`Edit → Content-Aware Move…` requires an explicit selection on a visible,
unlocked raster layer. It asks for bounded horizontal and vertical offsets,
fills the vacated selection from deterministic nearby context, and translates
the selected pixels into the destination. The result is a new raster asset in
the normal immutable history stack, so undo and local draft reload retain the
original source.

This is a constrained local operation. It does not perform semantic object
detection, generative fill, identity preservation, or remote inference. Pure
validation and pixel coverage is in `tests/content-aware-move.test.mjs`, with
desktop/mobile menu, dialog, asset-change, selection and reload acceptance in
`tests/browser/content-aware-move.spec.ts`.
