# Smudge tool contract

PixelForge's Smudge tool is a local, undoable raster command. A pointer gesture
decodes the selected raster asset into a private gesture buffer, drags a
carried paint load across it, and commits the buffer as one new asset (one
undo step). The original asset remains available to undo/redo and is included
in local/project round trips. It is a bounded local approximation of the
Photoshop Smudge tool, not a claim of parity.

## Carried paint (`src/smudge.ts`)

- **Pick up.** The first dab of a stroke loads a per-pixel, tip-sized paint
  buffer (premultiplied RGBA floats) from the pixels under it. Without Finger
  Painting that dab deposits nothing, so a stationary tap is a no-op.
- **Deposit and re-pick.** Every later dab blends the carried paint onto the
  layer by `Strength × tip coverage` (× texture, × selection alpha), then picks
  the result back up into the load by tip coverage. Paint therefore smears
  texture and detail (stripes dragged along their length stay stripes), fades
  with distance, and is dragged almost unchanged at Strength 100%.
- **Distance, not dab count.** The load moves with the tip, so canvas paint
  entering the tip's leading edge reaches the trailing edge after about one
  diameter ÷ (1 − Strength) of travel whatever the dab spacing. Smudge uses its
  own 10% spacing (minimum 1 px); pure tests check that 4%, 10% and 25% spacing
  produce trails within a factor of 1.6 of each other.
- **Alpha.** Alpha is picked up and deposited like colour: dragging opaque
  paint onto transparent pixels paints them, dragging transparency into opaque
  pixels thins them, and a stroke that only carries transparent paint changes
  nothing (transparent pixels' hidden RGB is never pulled into visible paint;
  pixels that become fully transparent are written as `0,0,0,0`). Strokes on a
  fully transparent layer therefore need Finger Painting or Sample All Layers
  to supply colour.
- **Large brushes.** The load is at most 512 cells per side per copy (and
  2 Mi cells across symmetry copies); larger tips share one cell between
  `cell × cell` pixels and update it by the average pick-up, so memory stays
  bounded at the 5,000 px brush limit.

## Options

The tool options panel (`src/SmudgeToolOptions.tsx`) shows, below the shared
Size and Hardness controls:

| Control | Behaviour |
| --- | --- |
| **Strength** 0–100% (default 50%) | Replaces the old Smudge "Flow" (which was the shared brush opacity). Drafts saved before Strength existed with Smudge active migrate their `brushOpacity` to Strength; others start at 50%. |
| **Mode** | Normal, Darken, Lighten, Hue, Saturation, Color, Luminosity. The smudged colour is combined with the existing pixel through `blendRgb` (`src/blendModes.ts`); over partly transparent pixels the result is weighted by the existing alpha. |
| **Sample all layers** | Renders the visible composite once at pointer-down into the edited layer's local pixel space and samples/picks up from it while depositing onto the active layer; the composite is smudged virtually with the same deposits. In Normal mode a stroke on an empty layer reproduces smudging the flattened image (pure test, ±3 levels). |
| **Ignore adjustment layers** | With Sample all layers, leaves adjustment layers out of the sampled composite. |
| **Finger painting** | Starts the load as the opaque foreground colour; the first dab deposits it. |
| **Pressure affects size / strength** | Pen/touch pressure (with the shared pressure curve) scales the dab diameter and/or Strength; a pen lift paints nothing when either mapping is on. Mouse input is full pressure. |
| **Angle, Roundness** | Shared brush-tip settings; they shape non-round tips and have no effect at 100% roundness. |
| **Scatter, Scatter both axes, Count, Count/Size/Angle jitter, Strength jitter** | Shared brush dynamics (`src/brushDynamics.ts`); Strength jitter is the shared opacity jitter. Positions and jitter are hashes of the stroke point, so a replayed stroke yields identical pixels. |
| **Bristle, Texture** | Shared settings. Bristle filaments (in tip-local space) leave streaks because gaps neither deposit nor pick up; Texture is paper grain fixed to layer pixels that modulates deposits. |
| **Saved brush preset** | The shared preset library. A preset saved with Smudge active also stores `smudge` (Strength, Mode, Finger Painting, Sample All Layers, Ignore Adjustments, pressure strength) and restores it when chosen; other presets leave Smudge options alone and only set the shared tip. Older presets load unchanged; invalid `smudge` values fail validation. |
| **Symmetry** | Paint Symmetry applies to Smudge: every copy is the geometric image of the dab and carries its own paint load. |

Size, Strength, Mode, tip and symmetry are fixed for a stroke at pointer-down.
All options persist in drafts and `.pixelforge` projects under
`settings.smudge` (validated, every key optional) plus the shared brush keys.

`[` and `]` change the brush size for Smudge as for every painting tool.
`Ctrl+[` / `Ctrl+]` are intentionally left unbound: Photoshop uses them for
Send Backward / Bring Forward, so they are reserved for layer arrangement.

## Safety and performance

- A selection is rendered once at pointer-down in the edited raster's local
  pixel space; deposits are scaled by its alpha, so bytes outside the
  selection never change.
- Locked, hidden and non-raster layers reject strokes. Trimmed (stored-bounds)
  paint layers are expanded at pointer-down like other paint tools
  (`EXPANDING_PAINT_TOOLS`). Pointer cancellation restores the last committed
  frame; stale document/layer changes cancel instead of committing.
- Each pointer segment plans its dabs first, then reads and writes only the
  window around them grown by the stroke's largest tip (`smudgeDabReach`),
  through `windowedCanvasStroke`. The Sample All Layers composite is a
  full-layer byte array read in place. Windowed and full-layer strokes are
  byte-identical in `tests/smudge.test.mjs` (pressure, angle/roundness,
  bristle, texture, scatter/count/jitter, selection, Sample All Layers with
  Darken, Finger Painting with dual-axis symmetry). Live previews use the
  coalesced gesture preview, so preview equals commit.
- Performance smoke (pure, local): a 1,000 px stroke with a 300 px brush on a
  2646 × 4096 layer runs in about 1.3 s of kernel time on the development
  machine (≈ 330 dabs; budget asserted < 8 s) with windows under 600 × 600 px.
- Layer → Stroke Path with Brush uses the same engine (one stroke per contour;
  simulated pressure scales size and Strength).

## Evidence

Pure: `tests/smudge.test.mjs` (settings/migration, draft and preset
validation, Strength 0/50/75/100, fade with distance, spacing independence,
per-pixel texture, alpha pick-up/deposit, Finger Painting, Sample All Layers on
an empty layer, every mode, angle/roundness, pressure size/strength, scatter
determinism, selection confinement, symmetry, bounded large-brush load,
windowed == full, invalid input, performance smoke).

Browser (desktop and mobile): `tests/browser/smudge.spec.ts` (R activation,
Strength persistence, colour drag with alpha, undo/redo/reload, selection
confinement, tap no-op, lock guard, touch cancellation) and
`tests/browser/smudge-options.spec.ts` (labelled controls and keyboard
operation, `[`/`]`, reload persistence, red→white strokes at Strength 50 vs 75
with undo/redo, Darken/Lighten gating, Finger Painting, Sample All Layers on a
new empty paint layer, preset save/apply).

Not implemented: Photoshop's wet-media mixing, sampled custom tip shapes, and
dual-brush/wet-edges/build-up modulation for Smudge.
