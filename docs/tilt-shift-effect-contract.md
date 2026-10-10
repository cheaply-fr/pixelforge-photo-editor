# Tilt-Shift Blur Gallery contract

PixelForge exposes **Filter → Blur Gallery → Tilt-Shift…** as a bounded,
nondestructive local effect. It stores a validated `adjustments.filterEffects`
record on the selected layer and never replaces the immutable source asset.

```ts
{
  type: 'tilt-shift',
  amount: 0..100,
  radius: 0..64,
  angle: -180..180,
  centerX: 0..1,
  centerY: 0..1,
  seed: uint32,
  tiltShift: {
    focusWidth: 0.05..0.8,
    feather: 0.05..0.8,
  },
}
```

`centerX` and `centerY` locate the middle of the focus line. `angle` rotates
the line clockwise from horizontal. `focusWidth` is the full sharp band as a
fraction of the maximum cross-axis extent; `feather` is the normalized ramp
from sharp to the requested blur. `radius` controls the bounded alpha-aware
box kernel and `amount` blends the result with the source. The geometry is
normalized, so a project keeps the same intent when its raster is resized or
rotated.

Rendering is deterministic and source-only. It keeps the source alpha and
fully transparent RGB padding byte-for-byte stable, skips hidden coverage,
clamps at document edges, and allocates only the bounded blur working
buffers. A zero amount or radius is an identity operation returning a detached
buffer. Invalid or legacy metadata is clamped to the default focal band
(`focusWidth: 0.36`, `feather: 0.5`) during document normalization.

This is deliberately a local focal-plane approximation. It does not infer a
depth map, reconstruct camera bokeh/highlights, simulate perspective or expand
the canvas. Pure tests cover determinism, source immutability, focus-band
falloff, rotated orientation, centre/geometry bounds, identity controls,
transparent RGB/alpha preservation and malformed metadata. Desktop and mobile
browser acceptance covers menu enablement, editable controls, undo, local
reload, project round-trip, source-asset retention and rendered pixels.
