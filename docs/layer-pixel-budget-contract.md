# Layer pixel budget and Trim Layer to Content contract

## Budget

An editable frame may store at most **64,000,000 pixels** of top-level raster
and Smart Object layer assets (`LAYER_PIXEL_BUDGET` in `src/document.ts`).
Each layer counts its own stored asset (`w × h`), even when several layers
share identical pixels; nested Smart Object contents are validated separately.
Text, shape, path, and adjustment layers cost nothing. The budget bounds the
decoded source data an editable frame can retain in a browser tab; it is a
safety limit, not a performance claim.

`layerPixelUsage(frame, assets)` computes the same quantity that
`validateFrame` bounds. `validateFrame` checks the budget **after** every
structural check, so malformed data keeps the generic `Invalid layer
document` error, while a well-formed but oversized stack throws
`LayerPixelBudgetError` with an actionable message:

> Layer pixel budget reached: layers may store 64 MP in total and this edit
> needs 80 MP. Merge or trim layers (Layer > Trim Layer to Content), or use a
> smaller canvas.

The required amount is rounded **up** to 0.1 MP so an edit one pixel over the
limit never reads as "needs 64 MP". Edits that commit through document
history (Add paint layer, Duplicate, image and Smart Object layers, and the
other layer commands) surface this message in the status line. The Layers panel shows the current
usage under its `n / 32` heading as `Pixel budget 54.2 / 64 MP`, with a
tooltip that explains how to free space; the hint turns amber above 90%.

At 2646 × 4096 (10.8 MP) the background plus four full-canvas paint layers
fit; the sixth full layer is refused with this explanation.

## Trim Layer to Content

`Layer → Trim Layer to Content` stores the active raster layer at its
non-transparent bounding box (alpha > 0). The layer matrix gains the crop
offset, so every visible pixel stays in place and the composite, export and
flattening are unchanged. An empty layer is stored as a single transparent
pixel. A layer that already fits its content is left alone. The command is one
undoable history step; the original asset remains available through history.

It is limited to plain paint layers that can be expanded again safely:
raster layers without a solid-fill source colour, layer styles, vector mask,
live filter effects, smart filters, or local cleanup metadata (spot healing,
patch strokes, content-aware fill/move/scale), positioned by an integer
translation (no rotation, scale or sub-pixel offset). Otherwise the command
is disabled. Canvas-space layer masks are unaffected.

## Paint-time expansion

A raster layer that is integer-positioned and does not cover the canvas
(trimmed, or moved with the Move tool) is grown before these tools write to
it: Brush, Pencil, Eraser, Background Eraser, Magic Eraser, Paint Bucket,
Gradient, Color Replacement, Clone Stamp, Healing Brush, Pattern Stamp,
Smudge, Dodge, Burn, Sponge, Blur, Sharpen and Mixer Brush. The new asset is
the union of the layer's current bounds and the canvas, so pixels already
outside the canvas are kept, and the layer matrix becomes that union's origin.
The expansion is its own undo step before the stroke (Undo removes the stroke,
a second Undo restores the trimmed layer). A tap released while the layer
decodes is replayed, so single-click tools such as Paint Bucket still apply.

If the expansion itself would exceed the budget, the status line says so and
the layer keeps its stored bounds; a press outside those bounds is ignored
instead of silently painting nothing, while a press inside them paints as
before. Expansion is skipped (existing behaviour) for rotated, scaled or
sub-pixel layers and for layers whose metadata is tied to asset coordinates
(vector mask, smart/live filters, cleanup metadata), and when the union would
exceed the 16 MP / 16,000 px per-asset limit.

## Not covered

- Layer-mask painting, Quick Mask and adjustment brushes write canvas-space
  masks and never need expansion.
- Spot Healing, Patch, Red Eye, History Brush and Art History Brush do not
  expand a trimmed layer; they act within its stored bounds. History Brush
  falls back to current pixels and Art History Brush refuses a source snapshot
  whose stored size differs, as for any size-changing step.
- Filters and adjustments run on the stored asset; on a trimmed layer they
  cover its stored bounds only.
- Layers are not trimmed automatically; new paint layers still start at the
  full canvas size.

## Persistence

Trimmed and expanded layers are ordinary raster layers with a smaller or
larger asset and a translation matrix, so `.pixelforge` projects, IndexedDB
drafts (with their 64 MiB asset ceiling), undo/redo, export and flattening
need no format change.

## Verification

- `tests/layer-pixel-budget.test.mjs`: usage counting, the exact poster
  boundary, budget error vs malformed-document error, megapixel formatting,
  trim bounding boxes (empty, single pixel, edge-touching, full), local
  translation composition, expansion geometry and eligibility.
- `tests/browser/layer-pixel-budget.spec.ts` (desktop and mobile): filling the
  budget on a 3999 × 4000 document, the specific notice for Add and Duplicate,
  the Layers panel hint, trimming an empty layer to free budget, the refused
  expansion notice, painting outside a trimmed layer's bounds with composite
  pixel checks, two-step undo/redo, a `.pixelforge` export/import roundtrip,
  and the disabled command for non-pixel layers.
