# Mixer Brush and History Brush contract

PixelForge now includes two bounded painting workflows that keep anonymous
local drafts source-safe and reversible.

## Mixer Brush (B)

At pointer-down the editor captures an immutable RGBA source snapshot from the
active raster layer. Each touched brush stamp blends the source colour into a
detached destination buffer using radial coverage, hardness, flow and the
persisted Wet, Load and Mix controls. Source pixels are never mutated while a
stroke is in flight. One asset replacement is committed at pointer-up, so the
whole stroke is one undo step and reload/project export retains the result.

## History Brush (Y)

History Brush uses a selected local undo-history frame as its source. The source
index is bounded to the current 24-frame history window and is persisted with
the draft. If the selected frame is evicted, the editor clamps to the nearest
available frame. A stroke restores historical RGBA through brush opacity, flow,
hardness and selection alpha; it never changes the source frame. The current
stroke is committed as one undo step and is safe to cancel by switching tools.

## Determinism and limits

`src/mixerHistoryBrush.ts` exposes pure byte-array helpers with strict canvas,
point and setting bounds. The implementation intentionally does not claim
Photoshop's bristle simulation, full wet-media buildup across dabs, Art History
stylisation, PSD history metadata, linked cloud sources or adjustment-brush
semantics. Advanced dynamics can be added behind a separate contract without
changing the source-retention guarantees here.

Both tools require a visible, unlocked raster layer. Layer masks and active
selections clip the stroke in layer-local alpha space. Transparent source
pixels never erase an opaque destination, preserving edge alpha and hidden RGB.
