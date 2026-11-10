# Spot Healing / Remove contract

PixelForge's Spot Healing tool is a bounded, local object-cleanup operation.
It is designed for dust, small blemishes and short marks where surrounding
pixels provide a reliable context. It does not perform semantic subject
detection, generative fill or Photoshop-compatible content-aware synthesis.

Each committed stroke stores only versioned metadata on the raster layer:

```ts
{
  version: 1,
  points: [{ x, y }, ...],
  size: 1..10000,
  hardness: 0..100,
  opacity: 0..1
}
```

The immutable source PNG remains the layer's `asset`. Rendering replays the
strokes in layer-local coordinates before transforms, masks and adjustments.
At each affected pixel, a fixed 16-sample annulus outside the brush footprint
supplies a per-channel median. The median rejects a single edge outlier while
keeping the edit deterministic across browsers. Radial coverage and opacity
blend RGB only; source alpha is retained byte-for-byte. Fully transparent
pixels have RGB reset to zero at the end of a render.

Validation limits the layer to 128 strokes and 4096 points per stroke. Malformed
metadata, invalid coordinates and oversized arrays fail closed at document
validation. Undo, reload, project export/import and cloud drafts therefore
replay the same operation without baking over the source asset.

## Type (toolbar audit I-18, 2026-11)

New strokes record an optional `type`; strokes without one (all strokes made
before types existed) replay as `proximity`, byte-for-byte. The Type menu is
persisted as `retouchOptions.spotHealingType` (default `content-aware`). All
three are bounded local approximations of Photoshop's options:

- **Proximity Match** (`proximity`): the original per-position median of a
  16-sample ring just outside the brush, described above.
- **Content-Aware** (`content-aware`): the whole stroke footprint (the union
  of its dabs) is the hole. For each covered pixel, eight rays (axes and
  diagonals) travel to the first visible pixel outside the footprint, up to
  1.5 × the brush size; the hits are averaged with inverse-square distance
  weights. Opposite hits interpolate across the hole, so gradients and edges
  crossing the stroke continue through it. A mark that extends beyond the
  stroke can still bleed into its ends.
- **Create Texture** (`texture`): the Content-Aware tone plus high-frequency
  detail (a donor pixel minus its 5 × 5 mean) from a donor area one diameter
  away, in the first of the eight directions whose shifted footprint overlaps
  the hole least.

Coverage, opacity, selection snapshots and alpha preservation are unchanged.
Evidence: `tests/audit-retouch.test.mjs` (gradient continuation, texture
spread, legacy replay, selection confinement) and
`tests/browser/audit-retouch-healing.spec.ts` on desktop and mobile.

The contract is intentionally explicit about its limitation: broad objects,
complex textures, perspective edges and semantic removal remain staged for a
future patch/content-aware model and must not be described as AI removal.

## Selection confinement (fix wave 2 polish, 2026-11-07)

A stroke started with an active selection captures it once at pointer-down:
the selection (rectangle, ellipse, lasso, polygon or pixel mask, feathered or
inverted) is rendered into the layer's own pixel space (so moved or scaled
layers stay aligned) and stored as a white alpha PNG asset; the stroke records
the asset id as an optional `selectionMask`. Replay multiplies each write by
the coverage (0 skips the pixel, partial coverage blends proportionally);
context samples may still come from outside the selection. The live preview
waits for the snapshot, so preview and commit match. Snapshots are reused
rather than re-encoded (`src/selectionSnapshotCache.ts`, shared with Patch):
a key of the selection's stored value plus the layer id, placement and size
finds a stored asset without rasterizing again (later strokes, undo/redo,
Reselect, switching back to an earlier selection), and a 64-bit digest of the
rasterized coverage finds an identical mask made from a new selection value
(the same marquee drawn again). The cache keeps at most 16 ids and digests,
never mask pixels, and ignores assets no longer in the document. Evidence:
`tests/retouch-preview-cache.test.mjs` and the "reuses one stored selection
mask" browser case (four strokes across Deselect/Reselect and a redrawn
marquee reference one mask asset).

`selectionMask` is optional: strokes recorded before it existed have none and
replay byte-for-byte as before. A present id must name an asset of the
layer's size, otherwise the document fails validation; the asset is retained
by history, drafts and project files even after the selection is dropped, and
it is fingerprinted in the layer-filter cache key (#185). Evidence:
`tests/retouch-selection-snapshot.test.mjs` (confinement, feathered blend,
legacy replay, validation, draft retention, cache key) and
`tests/browser/retouch-brush-polish.spec.ts` on desktop and mobile
(rectangular selection with undo/redo, Deselect and reload; freehand lasso;
an unselected stroke stays unconfined).
