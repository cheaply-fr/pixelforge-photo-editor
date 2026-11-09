# Mixer Brush and History Brush contract

PixelForge now includes two bounded painting workflows that keep anonymous
local drafts source-safe and reversible.

## Mixer Brush (B)

At pointer-down the editor captures an immutable RGBA source snapshot from the
active raster layer. The brush is loaded with the snapshot paint under its first
dab and carries that reservoir along the stroke: every dab deposits the
reservoir (radial coverage × Flow × (0.25 + 0.75 × Wet)) and then picks up the
snapshot paint under it (Mix × (1 − 0.8 × Load) of the reservoir is replaced),
so dragging from the sky into the sun smears sky colour into the sun. The
reservoir lives on the gesture across pointer moves (one per Paint Symmetry
copy). Before the 2026-11 audit (B-10) each pixel was mixed with its own
snapshot value, which is the same pixel, so a stroke never changed anything
but still added a history step. A stroke that changes no pixel (for example on
an empty layer) now shows "No Mixer Brush change" and adds no history. Source pixels are never mutated while a
stroke is in flight. One asset replacement is committed at pointer-up, so the
whole stroke is one undo step and reload/project export retains the result.

## History Brush (Y)

History Brush uses a selected local undo-history frame as its source. The source
index can address any frame of the in-memory history (up to 240 frames) and is
persisted with the draft, re-based onto the persisted 24-frame window (dropped
when its frame is memory-only). If the selected frame is evicted, the editor clamps to the nearest
available frame. A stroke restores historical RGBA through brush opacity, flow,
hardness and selection alpha; it never changes the source frame. The current
stroke is committed as one undo step and is safe to cancel by switching tools.

## Determinism and limits

Each pointer move applies its dabs to the window of the gesture buffer that
they can reach (plus the Art History dab-colour sampling radius), reading the
stroke source only there (`src/strokeWindow.ts`, `tests/stroke-window.test.mjs`).
History Brush and Mixer Brush (without a wet sample) restore or mix the source
pixel at the same position; before this contract revision the kernel read the
source's first pixel for every dab.

`src/mixerHistoryBrush.ts` exposes pure byte-array helpers with strict canvas,
point and setting bounds. The implementation intentionally does not claim
Photoshop's bristle simulation, full wet-media buildup across dabs, Art History
stylisation, PSD history metadata, linked cloud sources or adjustment-brush
semantics. Advanced dynamics can be added behind a separate contract without
changing the source-retention guarantees here.

Both tools require a visible, unlocked raster layer. Layer masks and active
selections clip the stroke in layer-local alpha space. Transparent source
pixels never erase an opaque destination, preserving edge alpha and hidden RGB.
