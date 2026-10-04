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

The contract is intentionally explicit about its limitation: broad objects,
complex textures, perspective edges and semantic removal remain staged for a
future patch/content-aware model and must not be described as AI removal.
