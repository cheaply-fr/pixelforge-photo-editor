# Light Rays filter contract

PixelForge's **Filter → Render → Light Rays…** command is a bounded, local,
nondestructive approximation of radial light rays, god rays and starburst
glints. It stores `filterEffects.type = light-rays` plus a normalized
`lightRays` settings record on the layer (or a Smart Filter stack entry) and
re-renders from the immutable source asset; generated pixels are never
persisted as a replacement asset. It is not a physical light simulation and
makes no Photoshop-parity claim.

## Parameters

Pure logic lives in `src/lightRays.ts`; `src/LightRaysControls.tsx` is the
panel UI and `app/page.tsx` only wires the menu command and defaults.

| Field | Range | Meaning |
| --- | --- | --- |
| `centerX`, `centerY` | 0–1 | Ray origin, layer-local; edited with the shared on-canvas centre handle and pixel fields. |
| `mode` | `generate` / `source` | Analytic rays, or radial streaks of the layer's own bright pixels. |
| `shape` | `rays` / `starburst` | Soft rays, or pointed spikes (long/short alternation from six spikes) with a core glow. |
| `count` | 2–720 | Rays or spikes; in source mode, the number of angular variation cells. |
| `length` | 1–300 % | Of half the layer's shorter side, measured outward from the inner radius. |
| `width` | 0.5–256 px | Ray half-width at its base (half-pixel steps). |
| `sharpness` | 0–100 % | Taper toward the tip (starburst always tapers to a point). |
| `randomness` | 0–100 % | Seeded per-ray angle jitter, length, width and brightness (source: angular brightness cells). |
| `rotation` | −180–180° | Rotation of the fan. |
| `innerRadius` | 0–100 % | Of half the shorter side; rays and streaks start outside it (pupil/iris). |
| `falloff` | 0–100 % | Brightness decay toward the tips. |
| `color` | `#rrggbb` | Light colour (multiplies streak colour in source mode). |
| `intensity` | 0–400 % | Light gain; the generic `amount` remains the overall mix. |
| `blend` | `screen` / `add` / `transparent` | Composite over the layer, or also fill transparent pixels. |
| `threshold` | 0–254 | Source mode: luminance at or below this level does not streak. |
| `seed` | uint32 | Shared filter seed; output is deterministic per seed. |

Lengths and the inner radius stay stored as percentages so saved documents
keep their look; the Filter effects panel shows the resulting layer pixels
next to each slider ("Ray length 40% · 529 px", "Inner radius 54% · 714 px"
on a 2646 px wide layer) and a note: rays run from the inner radius to inner
radius + length from the centre, measured in half the layer's shorter side,
and with the current falloff they fade below 5% brightness at about N px
(`lightRaysPixelExtent` in `src/lightRays.ts`; the renderer uses the same
values). Randomness can shorten individual rays further. A layer mask is
applied after the filter, so rays beyond a masked shape are hidden.

Malformed or out-of-range values normalize at every persistence and render
boundary; `validFilterEffects` only accepts the exact normalized record, and
only on `light-rays` effects.

## Pixel rules

- Screen and Add keep alpha byte-for-byte and leave fully transparent pixels
  (including hidden RGB) untouched, like the other local filters.
- `transparent` ("Render on transparent") lets light fill transparent pixels,
  growing alpha (as Render → Clouds with Fill does); opaque pixels composite
  exactly as Screen.
- `amount` 0 or `intensity` 0 is a detached identity; the source buffer is
  never mutated.

## Performance

Generate mode is pointwise: each pixel tests only the rays within its angular
reach (sorted rays + an angle-bin lookup). It is band-safe with a halo of 0
and renders through the parallel filter worker bands with an explicit
full-image frame, byte-identical to the serial render. Source mode extracts
bright light, box-downsamples it to at most 2 Mpx, accumulates it outward with
log₂(length) doubling passes (an exact truncated exponential kernel along each
ray), then upsamples; it renders as one full-frame job. On a 2646 × 4096 layer
the serial renders take roughly 0.3–2.5 s on a desktop CPU; the unit suite
enforces a generous bound.

## Acceptance

Unit tests cover determinism, ray geometry and counts, inner radius, alpha and
transparent padding, render-on-transparent, starburst, source streak
direction, band equivalence, normalization, persistence, Smart Filter stacks,
layer filter cache keys, Actions and the 2646 × 4096 performance bound.
Browser tests (desktop and mobile) apply Light Rays from the Render menu, move
the centre by drag and keyboard, change parameters, undo/redo, edit a stacked
entry and its centre, and reload.
