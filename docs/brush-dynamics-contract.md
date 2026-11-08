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

## Silk strands (2026-11-08)

Branch `feat/brush-silk-strands`. Brush options gain a **Silk strands**
checkbox next to Count. When it is on, one ordinary drag paints a ribbon of
fine parallel strands that twist around the stroke, so silky smoke, hair-like
wisps and light trails no longer need thousands of scripted points. Brush
only: Pencil, Eraser and the other brush-family tools do not show it.

Controls (all persisted, all deterministic):

| Control | Range | Default | Meaning |
| --- | --- | --- | --- |
| Strands | 1–48 | 16 | Number of strands across the ribbon |
| Ribbon width | 1–2,000 px | 120 | Full width of the ribbon at its widest |
| Twists | 0–20 per stroke (0.5 steps) | 2 | Full turns of the ribbon over the whole stroke |
| Wobble | 0–100% | 35 | Per-strand low-frequency drift (turbulence) |
| Strand opacity jitter | 0–100% | 50 | Random reduction of each strand's peak opacity (up to 90%) |
| Seed | 0–99,999 | 1 | Seed for every per-strand random choice; **New seed** picks another |

Geometry (`src/brushStrands.ts`, pure):

- The pointer samples (including browser-coalesced ones) are thinned (≥ 2 px
  apart, at most 8,192), interpolated with a centripetal Catmull-Rom spline
  and resampled at an even arc-length step of `width / 60` clamped to 1–4 px
  (at most 4,000 samples; the live preview uses at most 1,200). Directions
  are box-filtered over half the ribbon width (at most 120 px) before the
  normals are taken, so a few sparse samples still give smooth strands and
  the inner side of a bend does not fold.
- Strand *k* sits at a ribbon coordinate *u* spread evenly across [−1, 1]
  (with a small seeded jitter) and is offset along the normal by
  `width/2 · sin(πt)^0.5 · (u·cos(φ + twists·2π·t) + a₁·sin(f₁·2π·t + p₁) + a₂·sin(f₂·2π·t + p₂)) / (1 + 0.5·wobble)`,
  with *t* the normalized arc length and φ a seeded phase shared by every
  strand. All strands therefore meet where the cosine is zero (an integer
  number of twists gives exactly 2 × twists crossings), the ribbon tapers to
  a point at both ends, and no strand leaves the ribbon's half-width.
- Each strand starts up to 16% late and ends up to 16% early (seeded), with
  an opacity envelope `sin(π·t′)^0.8` and a thickness taper `sin(π·t′)^0.5`
  inside its own window; strands on the far side of the twist are dimmed by
  up to 25%.
- Strand thickness is the brush **Size**, scaled by pen pressure when
  pressure-to-size is on (and opacity by pressure when pressure-to-opacity is
  on), using the selected pressure curve. Brush **Opacity** × **Flow** scales
  every strand. Hardness, spacing, scatter, Count, texture, dual brush,
  bristle, wet edges, build-up and colour dynamics do not apply to strands.
- Strands are drawn as polylines with butt caps and round joins. Consecutive
  segments whose opacity (1/64 steps) and width (¼ px steps) round to the same
  values share one path, so joints never double up alpha and a long stroke
  needs few draw calls.

Painting path: pointer moves only record samples and redraw a separate,
screen-resolution overlay canvas (at most 4,096 px on its longest side, one
redraw per animation frame, CSS `mix-blend-mode` matching the brush mode where
CSS has one). No layer-stack render runs during the drag, so the cost per move
does not depend on document size or layer count. On release the strands are
built once more at full resolution, painted into the layer buffer (each Paint
Symmetry copy, confined to the active selection, composited in the brush blend
mode like ordinary dabs) and committed as one undoable edit; the overlay is
cleared when that commit has rendered. A tap without a drag paints nothing.

Persistence: `settings.brushStrands` in drafts and `.pixelforge` projects,
and optional `brushStrands` in saved and built-in brush presets (presets saved
before it existed load with strands off). Validation rejects out-of-range
values. The built-in **Silk smoke** preset paints 22 strands, 140 px ribbon,
1.5 twists, 40% wobble, 60% strand opacity jitter, seed 7, 2 px strands with
pressure-to-size, 70% opacity, **Screen** mode.

This is a bounded local approximation of a ribbon brush for painting: it is
not a smoke or fluid simulation, has no self-occlusion between strands, and
is not modelled on any other editor's brush engine. Evidence:
`tests/brush-strands.test.mjs` (determinism by seed, taper, crossing count,
width bounds, sparse-input smoothness, pressure, batching, persistence) and
`tests/browser/brush-strands.spec.ts` (desktop and mobile: controls and
persistence, Silk smoke preset, distinct strands and no render during the drag,
twist pinch points and identical repaint after undo).
