# Adaptive Wide Angle contract

PixelForge exposes **Filter → Adaptive Wide Angle…** as a bounded,
browser-local approximation. It applies a deterministic inverse warp around
an editable optical centre. The guide angle rotates the correction field and
the amount/radius controls limit its strength and reach.

The operation is nondestructive: filter metadata is stored on the layer,
source assets are not replaced, and the renderer preserves the source alpha
byte for byte. Transparent RGB padding is left untouched. Reapplying the
same metadata produces the same pixels, which makes undo, project export and
reload safe.

This is intentionally not a camera-profile or line-solving implementation.
It does not infer lens calibration, correct chromatic aberration, expand the
canvas, or reconstruct hidden image areas. Those capabilities remain a later
roadmap item. The UI labels the approximation so users can distinguish it from
Photoshop's full Adaptive Wide Angle filter.

Coverage is in `tests/adaptive-wide-angle.test.mjs` and the existing filter
round-trip/browser suites. The local increment remains unreleased until its
branch receives protected CI, merge, deployment, and live verification.
