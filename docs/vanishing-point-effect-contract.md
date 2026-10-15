# Vanishing Point effect contract

`Filter → Vanishing Point…` is an enabled, local-only approximation of a
single Photoshop perspective plane. It applies an inverse projective remap to
the active visible raster or smart-object render while retaining the immutable
source asset and the editable `filterEffects` metadata.

The contract is deliberately bounded:

- `amount` is clamped to `0…100` and `radius` is a `1…64` plane-depth control.
- `centerX`, `centerY` and `angle` define the plane centre and orientation.
- `vanishingPoint.plane` selects a horizontal or vertical convergence axis.
- Sampling is deterministic premultiplied-alpha bilinear lookup from the
  source buffer. Alpha bytes and fully transparent RGB padding stay source
  owned.
- The same-sized canvas is preserved. Undo, project export/reload and recorded
  Actions retain the controls without copying pixels.

This does not claim Photoshop's authored multi-plane grid, clone stamp,
perspective-aware selections, content-aware fills, mesh editing or canvas
expansion. Those remain staged behind separate contracts and performance
evidence.
