# Filter effects panel controls contract

The **Filter effects** sidebar section edits the live filter record
(`adjustments.filterEffects`) or a stacked filter. Every filter stores one
integer `radius` (and, for the noise-cleanup filters, a `threshold`), but the
renderers read these fields differently. `src/filterControls.ts` describes
each filter's radius and threshold sliders so the panel only shows controls
that change the output and every readout states the unit the renderer uses.

## Radius slider

`filterRadiusControl(effect, layerSize)` returns the label, range, slider
value, stored-radius mapping and readout, or nothing when the filter has no
radius parameter.

- **No radius slider:** Average, Blur, Despeckle, Sharpen, Solarize, Field
  Blur (each pin carries its own radius; a pin-less record renders nothing),
  De-Interlace, NTSC Colors, Find Edges, Gradient Map, Add Noise, Light Rays,
  Difference Clouds and colour Clouds (these have their own size controls).
  Their renderers ignore `radius`, and radius 0 is not treated as an identity
  for them (`isNeutralFilterEffects`).
- **Source pixels (`px`):** the blur, sharpen, cell, wavelength, offset and
  frame-width radii. Blur More shows its real box radius (twice the stored
  value); legacy grayscale Clouds show their feature size (twice the stored
  value).
- **Share of the layer:** Pinch, Liquify, Twirl and Spherize radius read
  `radius / 64 × 70 %` of the shorter side; Polar Coordinates
  `radius / 64 × 50 %` of the shorter side; Lens Flare size
  `radius / 64 × 92 %` of the shorter side; Tree trunk length
  `radius × 16 % / 6` of the shorter side (at most 40 %; the slider spans
  1–15); relative Lens Correction / Adaptive Wide Angle radius
  `radius / 64` of half the layer diagonal. Legacy Lens Correction / Adaptive
  Wide Angle records keep their source-pixel radius and show `px`.
- **Other units:** Radial and Spin Blur sweep in degrees; Flame detail is
  unitless; Emboss depth is shown in its real 1–8 px sampling depth and
  stored as `depth × 8` (legacy radii keep their `round(radius / 8)` depth).

## Other controls

- Dust & Scratches, Reduce Noise, AI Denoise, AI Sharpen and Reflection
  Removal thresholds read as `n / 255` levels.
- Tree branch count and Fibers variance are plain counts (no `%`).
- Path Blur centre sliders appear only for legacy records without an
  authored motion path; the path replaces the centre.
- After **Edit → Fade…** on a live filter, a **Faded to (Edit → Fade)**
  slider edits the stored `fade` opacity; 100 % removes it.

## Styling

The section uses the `filter-effects-panel` class. Descriptions use the
sidebar note style; plain labels with a select or checkbox lay out like
`.select-row`; selects, number fields (`.number-input`, `.text-input` inside
`.slider`) and buttons (selection-region buttons, **Add filter to stack**,
stack and Blur Gallery buttons) use the compact bordered sidebar style, with
36 px touch targets below 680 px.

## Tests

`tests/filter-audit-fixes.test.mjs` renders every filter with its slider at
the minimum and maximum and asserts the pixels differ, checks the hidden
controls ignore `radius`, and checks each readout.
`tests/browser/filter-audit-fixes.spec.ts` covers the menu heading, the
controls, pixel changes and the panel styling on desktop and mobile.
