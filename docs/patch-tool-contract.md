# Patch Tool contract

PixelForge's Patch Tool is a bounded local source-offset retouch operation. It
copies a small neighbourhood from a user-selected source point into a dragged
destination stroke. It is useful for repeating texture, broad blemishes and
short object marks where nearby pixels are a good match. It does not perform
semantic subject detection, content-aware synthesis, generative fill or remote
processing.

Each committed stroke stores only versioned metadata on a raster layer:

```ts
{
  version: 1,
  points: [{ x: number, y: number }, ...],
  size: 1..10000,
  hardness: 0..100,
  opacity: 0..1,
  sourceOffset: { x: number, y: number }
}
```

The immutable source PNG remains the layer's `asset`. Rendering replays Patch
strokes in local layer coordinates before transforms, masks and adjustments.
The source coordinate for each destination pixel is the destination plus the
captured source offset. A fixed source snapshot is used for each stroke, so an
earlier destination write cannot become a later source sample. Radial coverage
and opacity blend RGB only; layer alpha remains unchanged byte-for-byte.
Fully transparent pixels have RGB reset to zero after rendering.

Validation bounds a layer to 64 Patch strokes and each stroke to 4,096 points;
source offsets are limited to 16,000 pixels in each direction. Invalid
coordinates, non-finite values and oversized arrays fail closed. Source pixels
and edit metadata therefore remain available to Undo, local reload and
`.pixelforge` project export/import.

The user workflow is intentionally explicit: select Patch (or cycle the J
tools), click once to set a source, then drag over the destination. A locked,
hidden or non-raster active layer rejects the gesture. Escape or touch
cancellation restores the prior frame without a history entry. Selection
clipping is supported by the pure renderer's alpha-mask input; the initial UI
slice keeps the active selection contract separate until a persisted selection
snapshot is added.

This contract is local and deterministic. Patch is not Photoshop-compatible
content-aware fill and does not claim broad perspective reconstruction. Future
work may add a reviewed content-aware model behind explicit privacy, quota,
offline and cancellation gates.

## Required evidence

Pure tests cover source immutability, offset mapping, multi-point strokes,
clipping, alpha and transparent RGB handling, deterministic repeat rendering,
validation bounds and malformed inputs. Desktop and mobile browser acceptance
covers source selection, destination drag, source-asset retention, undo,
Escape/touch cancellation, locked-layer rejection and local reload/project
round trips. The protected CI build and live revision verification remain
required before release claims.
