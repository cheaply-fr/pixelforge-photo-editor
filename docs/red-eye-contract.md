# Red Eye contract

PixelForge's Red Eye correction is a local, deterministic raster primitive. It
does not upload the image or call a model. A click supplies a bounded radial
region; only opaque pixels whose red channel is sufficiently dominant over both
green and blue are corrected. Red is blended toward the green/blue midpoint,
with a soft radial edge and a configurable correction amount. Alpha and
non-matching pixels remain byte-identical.

The editor writes the returned pixels back to the gesture buffer. Before the
2026-11 audit (B-09) it published the unchanged input instead, so a click on
pure red (255, 0, 0) reported success, changed nothing and added an empty
history step. A stroke that matches no red-eye pixel now shows "No red-eye
pixels found under the brush" and adds no history; pure red is neutralised to
(0, 0, 0) at full amount.

`removeRedEye` accepts an immutable RGBA array and returns a fresh array, a
full-canvas correction mask, changed/no-op state and clipped bounds. Dimensions,
radius, threshold, amount and channel values are validated before any output is
published. The returned mask makes the editor operation undoable and allows
selection clipping to be added without changing the source asset.

The pure contract covers red-dominance classification, transparent-pixel
exclusion, soft coverage, source immutability, alpha preservation, clipped
bounds, no-op settings, malformed input and byte-deterministic replay. The UI
tool is enabled with threshold/amount controls and an undoable local gesture;
`tests/browser/red-eye.spec.ts` covers desktop and mobile tool activation,
settings persistence, undo/reload and lock rejection. This primitive does not
claim face detection, eye detection, or semantic object cleanup; it is a
bounded manual correction.
