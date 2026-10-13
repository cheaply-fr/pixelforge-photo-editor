# Content-Aware Scale contract

`Edit → Content-Aware Scale…` requires an explicit selection and a visible,
unlocked raster layer. It fills the original selection from deterministic local
context, then scales the selected pixels around their selection bounds using
bounded independent horizontal and vertical percentages from 25% through 400%.
The operation stores one validated `contentAwareScales` metadata entry plus an
immutable layer-local selection-mask asset; rendering replays it without
replacing the source raster, and undo removes the metadata entry.

This is a local pixel operation. It does not detect semantic subjects, preserve
object boundaries, or claim Adobe's content-aware scale algorithm. Empty or
non-intersecting selections are safe no-ops, transparent RGB is normalized, and
desktop/mobile acceptance coverage verifies prompt handling, source-asset
identity, representative pixels, export, reload, selection-mask retention,
and locked-layer guards.
