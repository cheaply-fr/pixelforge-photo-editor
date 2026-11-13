# Raster selection composition contract

Geometric selections, Color Range and Magic Wand all resolve to a bounded
canvas-sized alpha mask. When an existing selection is present, the Selection
mode controls deterministic alpha composition:

* **Replace** adopts the incoming mask.
* **Add** takes the per-pixel maximum.
* **Subtract** removes incoming coverage proportionally from the current mask.
* **Intersect** takes the per-pixel minimum.

The operation copies both inputs, rejects mismatched or oversized masks and
never mutates source pixels or the previous selection. The composed mask is
stored as a local document asset so undo, reload and project export retain the
exact alpha values. Both sides are resolved (feather, inversion and transform
applied) before composing, so the stored result has feather 0, is not inverted
and has no matrix (`composedSelection` in `src/selectionComposition.ts`);
repeated feathered Adds therefore leave earlier edges unchanged instead of
feathering them again on every render. Masks saved earlier with a feather keep
loading and render with that feather once. No inference provider or upload is involved. Pure tests
cover each operation, detached buffers, no-op detection and malformed input;
the protected desktop/mobile Color Range acceptance tests verify both
geometric-to-raster intersection and raster-to-geometric subtraction with soft
alpha. Async raster selection work captures its frame/index/asset snapshot and
publishes only while that frame remains current.

## Empty selections

A selection that covers no canvas pixels is still a selection, never "no
selection" (`src/selectionEmpty.ts`). Without this, Edit > Fill, Clear and
other selection-scoped edits would fall back to the whole layer.

* A Lasso, Polygonal or Magnetic Lasso path, or a Rectangular or Elliptical
  Marquee drag, that lies entirely outside the canvas commits an **explicit
  empty selection** in Replace and Intersect mode, and in every mode when there
  is no current selection. The status reads "… selection is outside the image;
  no pixels are selected". In Add and Subtract mode with a current selection,
  adding or removing nothing leaves that selection unchanged.
* The explicit empty selection reuses the existing schema: a full-canvas
  rectangle followed by the same rectangle in `subtract` mode. Drafts, undo,
  Reselect and `.pixelforge` projects need no new fields. Select > Inverse of
  it selects the whole canvas.
* Intersect or Subtract results that remove everything (geometric parts or a
  composed alpha mask) stay as they are: an all-zero selection.
* Edit > Fill… (it refuses before opening the dialog), the quick fills
  Alt/Option+Backspace and Ctrl/Cmd+Backspace, Edit > Clear, Delete/Backspace
  and Edit > Stroke Selection… check the rendered coverage. When nothing is selected they
  change no pixels, add no history step and show **No pixels are selected**.

Pure tests (`tests/selection-empty.test.mjs`) cover the encoding, validation
and roundtrip, gesture outcomes per mode, composition to an all-zero mask and
the coverage check. Desktop and mobile browser tests
(`tests/browser/selection-fill-limits.spec.ts`,
`tests/browser/lasso-offcanvas.spec.ts`) verify that an off-canvas Lasso and
a disjoint or off-canvas Intersect leave the canvas unchanged under Fill,
quick fill and Clear, and that Add mode keeps the current selection.
