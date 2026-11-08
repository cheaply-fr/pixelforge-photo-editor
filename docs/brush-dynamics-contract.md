# Brush dynamics contract

Brush, Pencil and Eraser expose persisted **Scatter**, **Dual brush** and
**Bristle** settings from 0 to 100%. Scatter gives each stamp a deterministic
local offset derived from its sample position and bounded by the brush diameter.
Dual brush and Bristle apply bounded deterministic opacity modulation to each
stamp. All zero values are exact identities; replaying the same pointer samples
produces the same pixels without consuming global randomness. The source asset
remains immutable until pointer-up commits one undoable raster edit.

The settings are validated in draft storage, default to zero for older
documents, remain anonymous/offline, and are covered by pure bounds and
determinism tests plus desktop/mobile project-file acceptance. These are bounded
local dynamics; full Photoshop secondary tip selection, physical bristle
geometry and wet-media simulation remain explicitly staged.

## Sparse stamping, Count and jitter (2026-11-07)

Spacing accepts 1–1,000% of the diameter (was 1–100%) and Scatter 0–1,000%
(was 0–100%), so a stroke can lay separated dabs for star fields and dotted
lines. Scatter keeps its original scale (100% moves a dab centre up to
0.75 × diameter) and grows linearly beyond it. **Scatter both axes** (on by
default, the previous behaviour) can be turned off to scatter only
perpendicular to the stroke. The first dab of a stroke has no direction yet,
so it is held back until the next point arrives and then scatters
perpendicular to that first segment; a click without movement places it with
both axes on release.

**Count** (1–16) places several dabs at each spacing step, **Count jitter**
(0–100%) varies that count symmetrically, by up to ±Count × jitter (100%
spans 0–2 × Count), clamped to 1–16 dabs (before fix wave 2 polish it only
reduced the count), and **Size**, **Angle**
and **Opacity jitter** (0–100%) vary each dab: size down to `1 − jitter`,
angle by up to ±180° × jitter, opacity down to `1 − jitter`. Every choice is a
hash of the stroke point, dab index and channel, so replaying a stroke gives the
same pixels; with default values the first dab is exactly the previous single
dab. Selection-confined strokes widen their dirty rectangle by the full
scatter reach.

The dynamics persist as `settings.brushDynamics` (and optionally in custom
brush presets); absent keys load the defaults and out-of-range values are
rejected. Evidence: `src/brushDynamics.ts`, `tests/brush-spacing-count.test.mjs`
and `tests/browser/brush-gradient-options.spec.ts` (500% spacing leaves pixel
gaps between dabs; Count with 300% scatter adds dabs that stay within the
scatter bound; settings survive reload; older projects load defaults) on
desktop and mobile. This is a bounded deterministic approximation of common
brush-engine shape and scattering dynamics, not Photoshop parity.

## Symmetric Count jitter and first-dab direction (fix wave 2 polish, 2026-11-07)

Branch `feat/retouch-brush-polish`. `brushDabCount` draws the per-step
variation from −1…1 instead of 0…1, so the mean dab count stays at Count and
Count 1 can place two dabs; the bounds stay 1–16 and the hash of the stroke
point keeps replays identical. `deferFirstBrushDab` and the stroke's spacing
state hold a perpendicular-only first dab until the stroke has a direction.
Evidence: `tests/brush-spacing-count.test.mjs` (range 4–12 for Count 8 at 50%
with both ends reached, mean close to Count, clamping at 1 and 16,
determinism, first-dab offset perpendicular to the next direction) and
`tests/browser/retouch-brush-polish.spec.ts` on desktop and mobile (Count 1
with 100% jitter paints a strict superset of Count 1 and a strict subset of
Count 2 along the same pointer path; ten strokes that, with both axes on,
deterministically move a first dab before the stroke start never do so with
both axes off).

## Colour dynamics (2026-11-07)

Branch `feat/brush-color-dynamics-presets`. Brush and Pencil add **Hue
jitter**, **Saturation jitter**, **Brightness jitter** and
**Foreground/background jitter** (each 0–100%) next to the other jitter
controls. Per dab, the foreground colour is first mixed towards the
background colour by up to the mix jitter, then converted to HSB: hue rotates
by up to ±180° × jitter, and saturation and brightness move by up to ±jitter
(clamped to 0–1). Alpha, pressure, opacity/flow, selection confinement and
the dab's position, size, angle and opacity are unchanged: colour offsets use
their own hash channels (5–8) of the stroke point and dab index, so strokes
replay identically and enabling colour dynamics never moves a dab. A white or
grey foreground has no hue, so Hue jitter alone leaves it unchanged; use
Saturation or Foreground/background jitter to tint it. Eraser ignores colour
dynamics.

The keys persist inside `settings.brushDynamics` and custom brush presets;
older settings omit them, load 0, and render byte-identically (a dab without
colour offsets returns the exact foreground colour). Evidence:
`tests/brush-color-dynamics.test.mjs` (HSB round-trip, bounds, determinism,
geometry independence, mix/HSB maths, legacy byte identity through
`applyRadialStamp`) and `tests/browser/brush-color-presets.spec.ts` on desktop
and mobile (Hue jitter paints at least four hue families from a red
foreground while the plain stroke stays exactly red; Foreground/background
jitter stays between red and blue). This is a bounded deterministic
approximation of common brush-engine colour dynamics, not Photoshop parity.

## Brush and Pencil Mode (2026-11-08)

Branch `feat/brush-blend-mode` (roadmap W4-3). Brush and Pencil options show a
compact **Mode** select (accessible name "Brush mode") above Opacity: Normal
(default) plus the blend modes Canvas 2D implements natively, grouped as in
Edit → Fill and the layer blend menu: Darken, Multiply, Color Burn, Lighten,
Screen, Color Dodge, Overlay, Soft Light, Hard Light, Difference, Exclusion,
Hue, Saturation, Color and Luminosity (`src/brushBlend.ts`). Behind and Clear
are not offered. The Eraser and retouch tools ignore the mode.

**Where the mode is applied.** Normal keeps the legacy path: each dab is
stamped straight onto the gesture buffer, so Normal strokes are byte-identical
to strokes painted before the option existed. Any other mode paints the stroke
on its own transparent stroke buffer with the unchanged dab arithmetic
(opacity × flow per dab, scatter, Count, colour dynamics, texture, dual tip,
wet edges, build-up, symmetry copies, all source-over against that buffer), so
overlapping dabs only build coverage, exactly as a Normal stroke would on an
empty layer. Every rectangle a segment touches is then recomposited from the
stroke-start layer pixels as `original ⊕mode stroke` with the shared W3C
reference in `blendModes.ts`, and the active selection is applied to that
composite with the same coverage mix as Normal strokes. Dabs within one stroke
therefore never blend against each other in the chosen mode (a Multiply stroke
does not darken itself where its dabs overlap), and repainting a rectangle is
idempotent. The live preview and the commit both read the same gesture
buffer, so they match. Layer → Stroke Path with Brush honours the mode for
Brush and Pencil by stamping the whole path onto a transparent buffer and
compositing it once. Over transparent layer pixels a blend-mode stroke paints
as Normal (W3C behaviour), so the mode is most useful on opaque pixels.

The mode is a saved tool option (`settings.brushBlendMode`, drafts and
`.pixelforge` projects; older settings omit it and paint Normal; unknown
values fail draft validation) and is stored in brush presets (see
[`custom-brush-presets-contract.md`](./custom-brush-presets-contract.md)).
Evidence: `tests/brush-blend-mode.test.mjs` (mode list and validation,
no self-compounding of overlapping Multiply dabs, flow coverage, W3C
arithmetic, rectangle/layer equivalence and idempotence, selection mixing,
preset/library/draft validation) and `tests/browser/brush-blend-mode.spec.ts`
plus a Stroke Path case in `tests/browser/stroke-path-brush.spec.ts` on
desktop and mobile (Multiply stroke exactly one coat over white and red,
Normal still compounds, Pencil Darken and Brush Screen, preview equals commit,
selection confinement and Paint Symmetry, preset round-trip, reload and
project export). This is a bounded local approximation of brush blend modes,
not Photoshop parity: there is no Behind/Clear mode, no per-stroke opacity
ceiling separate from flow, and no mode for Mixer, History or retouch brushes.
