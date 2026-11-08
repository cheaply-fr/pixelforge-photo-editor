# Layer pixel budget, automatic content-bounds storage and Trim Layer to Content

## Limits

Project limits live in `src/projectLimits.ts`. Two kinds of bound apply:

- **Format ceilings** (device independent) are enforced by validation of
  drafts, `.pixelforge` projects and worker requests, so a project saved on a
  large desktop still opens on a smaller device:
  - 512 layers and 128 groups per frame (`MAX_DOCUMENT_LAYERS`,
    `MAX_DOCUMENT_GROUPS`);
  - 1,024,000,000 stored layer pixels per frame (`LAYER_PIXEL_CEILING`);
  - 1 GiB of referenced PNG data per project and 4,096 assets
    (`PROJECT_ASSET_BYTES_CEILING`, `MAX_PROJECT_ASSETS`);
  - unchanged: 16 MP / 16,000 px per canvas and per asset.
- **Device budgets** bound what an edit may grow a project to in this tab.
  They come from coarse, never-persisted hints (`navigator.deviceMemory` and a
  mobile user agent):

  | Tier | When | Stored layer pixels | Referenced PNG data |
  | --- | --- | --- | --- |
  | desktop | not mobile, memory ≥ 8 GB or not reported | 1,024 MP | 1 GiB |
  | standard | not mobile, 4 GB | 384 MP | 384 MiB |
  | mobile | mobile user agent, > 2 GB | 256 MP | 256 MiB |
  | low-memory | 2 GB or less | 128 MP | 128 MiB |

  The desktop tier is 16× the former 64 MP pixel budget and 16× the former
  64 MB data cap; the layer cap is 16× the former 32. An edit that keeps or
  reduces stored pixels (or the current frame's PNG data) is always allowed,
  so opening a larger project on a smaller device never strands the user.

Each raster or Smart Object layer counts its own stored asset (`w × h`), even
when several layers share identical pixels; text, shape, path and adjustment
layers cost nothing. Because paint layers are stored at their content bounds
(below), the budget measures what layers actually hold, not canvas area.

`validateFrame` checks the ceiling after every structural check, so malformed
data keeps the generic `Invalid layer document` error while a well-formed but
oversized stack throws `LayerPixelBudgetError`. Edits that commit through
history additionally run `assertLayerPixelBudgetForEdit` with the device
budget and surface:

> Layer pixel budget reached: layers may store 256 MP in total on this device
> and this edit needs 270 MP. Merge or trim layers (Layer > Trim Layer to
> Content), or use a smaller canvas.

The required amount is rounded **up** to 0.1 MP. The PNG data guard reads
"This document's image data would exceed 256 MB on this device. Trim or merge
layers, or export a copy before adding more images." The Layers panel heading
shows `n / 512` and, under it, `Pixel budget 54.2 / 1024 MP` for this
device's tier, with a tooltip explaining how to free space; the hint turns
amber above 90%.

## Empty paint layers and automatic content-bounds storage

**Add paint layer** stores one transparent pixel. The first pixel tool grows
it to the canvas (paint-time expansion below), and after every committed
step the editor stores each paint layer the step replaced at its
non-transparent bounding box (alpha > 0) plus a 64 px transparent margin
(`AUTO_TRIM_MARGIN`, clamped to the asset), so layer styles such as shadows
and outlines and blurs added later are not clipped at the stored bounds (the
alpha-spreading blurs reach at most 64 px; see
[blur-effects-contract.md](blur-effects-contract.md)). It applies to the layers Trim Layer to Content supports (plain,
integer-positioned paint layers without styles, vector masks, live/smart
filters, fill colour or cleanup metadata), only to layers whose pixels the
step changed, and only to layers already in the stored-bounds regime: before
the step the layer did not cover the canvas (a new empty paint layer, a
trimmed or moved layer) or it was grown for the tool that made the step. A
full-canvas layer such as an opened photo keeps its storage, and opening a
project never rewrites it. This also covers bake paths on a stored-bounds
layer: Rasterize, Merge Down into a stored-bounds layer, destructive filters
and the paint tools all keep the result at its content bounds.

Trimming runs synchronously inside the commit from the canvas the step just
encoded, so there is no background pass that could race later edits, and
**one stroke stays one undo step**.

The paint-time expansion (below) is pixel-identical, so it replaces the
current history entry in place (`useDocument.amend`) instead of adding an
undo step; on phones this also keeps the page from reflowing under the
pointer. When the gesture ends without a commit (cancelled, or the tool made
no change) the layer is restored to its stored bounds.

Live filters chosen from the Filter menu grow a stored-bounds paint layer to
the canvas first, so generators such as Clouds and blurs cover the canvas.
Neighbourhood effects that reach more than 64 px beyond the content of a
stored-bounds layer (large shadows) are clipped at the stored bounds; painting
on the layer or Edit → Fill regrows it.

At 2646 × 4096 (10.8 MP) a poster with 300+ sparse paint layers uses a few
megapixels beyond the background; the desktop tier still fits 94 full-canvas
layers.

## Trim Layer to Content

`Layer → Trim Layer to Content` stores the active raster layer at its
non-transparent bounding box on demand. The layer matrix gains the crop
offset, so every visible pixel stays in place and the composite, export and
flattening are unchanged. An empty layer is stored as a single transparent
pixel. A layer that already fits its content is left alone. The command is one
undoable history step. Eligibility is the same as for the automatic pass.

## Paint-time expansion

A raster layer that is integer-positioned and does not cover the canvas
(trimmed, empty or moved) is grown before these tools write to it: Brush,
Pencil, Eraser, Background Eraser, Magic Eraser, Paint Bucket, Gradient,
Color Replacement, Clone Stamp, Healing Brush, Pattern Stamp, Smudge, Dodge,
Burn, Sponge, Blur, Sharpen, Mixer Brush, Spot Healing, Patch, Red Eye,
History Brush and Art History Brush, and before **Edit → Fill** and **Edit →
Stroke**. The new asset is the union of the layer's current bounds and the
canvas. Spot Healing and Patch store metadata in asset coordinates, so their
layers are expanded before that metadata exists and are not trimmed
afterwards. History and Art History Brush align a source snapshot stored at
different bounds through both layers' translations. A tap released while the
layer decodes is replayed at the document point where it happened, even if
the expansion reflowed the page.

If the expansion would exceed the device budget, the status line says so and
the layer keeps its stored bounds; a press outside those bounds is ignored
instead of silently painting nothing, while a press inside them paints as
before. Expansion is skipped for rotated, scaled or sub-pixel layers and for
layers whose metadata is tied to asset coordinates, and when the union would
exceed the 16 MP / 16,000 px per-asset limit.

## Rendering

The compositor skips layers that cannot change the composite without
decoding them: opacity 0, and plain integer-positioned raster layers whose
stored bounds lie entirely outside the canvas (`layerRenderSkippable`). Plain
paint layers are drawn at their offset straight from the decoded source, so a
small stored layer never allocates a canvas-sized buffer. For stacks of 8 or
more layers the outermost render keeps one canvas-sized snapshot of the
composite below the active layer (`src/compositeCache.ts`), keyed by layer
state and asset content fingerprints (folders, clipping bases and text paths
included). Later renders, including stroke previews, start from that snapshot
while every layer below is unchanged. A folder is composited once at its
first member, so when the edited layer is inside a folder the snapshot is
taken below the folder's first member; before, editing any layer inside a
folder invalidated the snapshot on every render. One snapshot is retained per render
context and released when another document is installed.

The same context also keeps the finished composite of the last committed
render (no live stroke overrides), keyed by `compositeEquivalenceKey`: the
ordered keys of the layers that can draw, with names, lock state, the active
and selected layers, folder collapse state and raw `clippingTo` links left
out (a clipped layer is keyed by its clipping group's base instead). Hidden
and 0% layers, and plain raster layers whose asset is known to be fully
transparent (a tiled asset with only empty tiles, or a PNG of at most 64×64
pixels whose alpha is zero, such as a new paint layer) and carry no styles,
filters, vector mask, healing/content-aware metadata, matting or adjustments,
are left out as inert. Adding, deleting, renaming or reselecting such a layer
therefore returns the cached composite at once instead of recompositing the
stack (on a 49-layer 2646×4096 painting "Add paint layer" used to show
"Rendering… 43/50 layers"). Each render publishes a best-effort
`pixelforge.composite-cache` performance mark with `{ final: boolean }`.
The retained finished composite is one more canvas-sized surface per render
context.

Clipped layers cache their finished result (source × clipping-base alpha),
cropped to its visible pixels, in a pass-aware cache of half the layer-cache
budget (`sharedClippedLayerCache`), keyed by `clippedLayerCacheKey`: the
source without its outer opacity, blend, folder or name, the clipping group's
base, a bound text path, their asset contents, frame size and colour mode.
Before, every render re-rendered each clipped layer and its base and
multiplied their alpha over the whole frame in software, so reordering,
adding or editing anything below a clipping group recomputed every group
above it. Live stroke overrides on the source or base are never cached. The
`pixelforge.composite-cache` mark also reports `clippedHits`.

## Not covered

- Layer-mask painting, Quick Mask and adjustment brushes write canvas-space
  masks and never need expansion.
- Destructive filters, Apply Image and Calculations run on the stored asset;
  on a stored-bounds layer they cover its stored bounds only.
- Undo history trimming is owned by the history budget; the asset budgets
  here only bound the current document.

## Persistence

Stored-bounds layers are ordinary raster layers with a smaller asset and a
translation matrix, so `.pixelforge` projects, IndexedDB drafts, undo/redo,
export and flattening need no format change. Drafts and portable projects
accept up to the 1 GiB / 4,096-asset ceilings (see
`draft-storage-contract.md` and `portable-project-bundle-contract.md`).

## Verification

- `tests/layer-pixel-budget.test.mjs`: usage counting, the 1,024 MP ceiling
  boundary, device budget growth rules, budget error vs malformed-document
  error, megapixel formatting, trim bounding boxes, translation composition,
  expansion geometry and eligibility.
- `tests/huge-projects.test.mjs`: device tiers, 512 layers / 128 groups,
  automatic trim and expansion candidates, tool coverage, history source
  alignment, render skipping, prefix composite keys, PNG data budget, drafts
  and `.pixelforge` bundles above 64 MB with corruption detection, CRC-32.
- `tests/browser/layer-pixel-budget.spec.ts` (desktop and mobile): the
  low-memory tier message and readout, empty paint layers costing nothing,
  the refused expansion notice, automatic content-bounds storage with one undo
  step per stroke, painting outside the stored bounds, and a project
  roundtrip.
- `tests/browser/huge-projects.spec.ts` (desktop and mobile): a 2646 × 4096
  poster with 41 layers and sparse strokes anywhere on the canvas, the
  readout, undo/redo, reload and portable roundtrip with identical pixels, and
  a `.pixelforge` project above 64 MB that opens, exports and reopens.
- `scripts/measure-huge-project.mjs`: local timing and memory measurement for
  a synthetic 320-layer, 660 MP poster (not run in CI).

## Related work

`feat/reference-layer-paste-export` adds a reference/guide layer intended to
sit outside export; its budget treatment is defined on that branch.
