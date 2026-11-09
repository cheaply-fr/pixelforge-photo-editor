# Brush, eraser, clone and healing contract

This document defines the raster-tool behavior required for the next paint and
retouch increment. It is intentionally separate from the document format: the
document stores user preferences, while an accepted stroke commits an
immutable PNG asset and remains undoable.

## Current implementation audit

The editor exposes `size`, `hardness`, `brushOpacity`, spacing, angle and
roundness for Brush, Pencil, Eraser, Clone, Healing and Pattern Stamp. All
four raster paths now use the same bounded local radial/elliptical
stamp primitive; no full-canvas mask is allocated for an individual pointer
event. Mouse and unusable pen/touch pressure use a deterministic fallback of
`1`. Pen and touch pressure affect diameter and opacity only when their separate
opt-in controls are enabled. Brush and Eraser use radial alpha coverage,
Clone keeps a fixed source offset. On the Clone tool, an Option/Alt-click
sets or re-anchors that source point without creating history; the following
stroke keeps the new offset for its complete gesture. Healing uses the same mask with its
bounded `0.65` blend. A pointer move publishes a preview and pointer-up commits
one PNG asset to the selected raster layer.

Pencil uses an integer hard edge and hides the softness and pressure controls
while sharing the same undoable raster path. Clone and Healing queue early
pointer points until their source buffer is ready, then replay them through the
same stamp contract. Clipped destination bounds map one-to-one to the
corresponding source range, and queued points retain their own pressure and
pointer type so asynchronous decoding cannot flatten a stroke. The pure model
suite covers 10 brush cases and the desktop/mobile browser suite covers 16
tests across settings migration, pressure fallback and independent mapping,
hardness, eraser undo/redo/reload, clone edge clipping, healing bounds, pointer
release pressure, and touch cancellation.

### Clone/Healing Aligned and Sample (toolbar audit I-16, 2026-11)

`Settings.retouchOptions.cloneAligned` (default on) and `cloneSample`
(`current` default, `below`, `all`) apply to Clone Stamp and the Healing Brush.
Aligned keeps the document-space source-minus-destination offset of the first
stroke after a source is chosen for every later stroke, until a new
Option/Alt-click; with Aligned off each stroke starts again at the chosen
source point (the earlier behaviour). Current & Below and All Layers read the
visible composite of the layers from the bottom up to the active layer, or of
every layer, rendered once at pointer-down into the active layer's pixel space;
Current Layer reads only the active layer as before. Older drafts omit the
options and use the defaults. Evidence: `tests/browser/audit-retouch-stamps.spec.ts`
(desktop and mobile).

## Persisted tool state

Extend `Settings` with validated, backward-compatible values:

| Property | Range | Default | Meaning |
| --- | --- | --- | --- |
| `brushOpacity` | 1–100 (percent) | 100 | Maximum alpha for Brush, Eraser, Clone and Healing stamps |
| `hardness` | 0–100 (percent) | 100 | Radius at which a stamp reaches full alpha; 0 is a fully soft edge and 100 is a hard circle |
| `pressureSize` | boolean | false | Apply supported pen pressure to diameter |
| `pressureOpacity` | boolean | false | Apply supported pen pressure to stamp alpha |
| `spacing` | 1–1000 (percent) | 25 | Distance between dabs as a percentage of the resolved diameter |
| `angle` | -180–180 (degrees) | 0 | Rotation of the local tip ellipse |
| `roundness` | 1–100 (percent) | 100 | Circular tip at 100; lower values compress the local vertical axis |
| `flipX`, `flipY` | boolean | false | Explicit local tip mirror controls; symmetric tips may render identical pixels |
| `brushPreset` | built-in id | `round-hard` | Deterministic local settings bundle; no pixels or network references |

Older drafts omit these fields and must migrate to the defaults above. A
mouse or touch device that reports no usable pressure must use a deterministic
fallback of `1`, so a normal mouse stroke is not unexpectedly faint. Pressure
values are transient input events and must never be serialized into a project
file.

Hardness validation accepts `0` for a fully soft edge. Keep the existing size
limits until a bounded large-image budget is measured; increasing the maximum
size is a separate performance change.

## Stamp algorithm

Use one shared stamp primitive for Brush, Eraser, Clone and Healing:

1. Clamp pointer pressure to `[0, 1]`; use `1` for mouse input and when the
   event pressure is missing, out of range, or a zero touch reading. A pen
   reading of `0` is kept: with a pressure mapping enabled, pressure at or
   below `0.01` is a pen lift and the dab paints nothing.
2. If `pressureSize` is enabled, multiply the configured diameter by pressure
   (with a documented minimum diameter, for example `0.25 × size`); otherwise
   retain the configured diameter.
3. If `pressureOpacity` is enabled, multiply `brushOpacity / 100` by pressure;
   otherwise use the configured opacity.
4. Resolve the bounded tip geometry. A roundness below 100 compresses the
   local vertical axis, and angle rotates that ellipse; flip controls are
   retained in the resolved settings. Render an alpha mask inside the
   circumscribing radius. For hardness `h`, use an inner radius of
   `radius × h / 100` at alpha `1` and a smooth radial falloff to alpha `0` at
   `radius`. Hardness 100 may use the existing filled circle fast path.
5. Space repeated dabs at `diameter × spacing / 100`, preserving the existing
   default 25% cadence. Composite the color through that mask with `source-over` for Brush/Clone/
   Healing and `destination-out` for Eraser. Every stamp uses the calculated
   opacity, including Eraser, so partial erasure is reversible and predictable.
6. Clone keeps the source-to-destination offset fixed for the complete stroke.
   Healing uses the same mask and a bounded blend/blur operation; it must not
   mutate the source asset while a preview is being drawn.

The implementation uses a clipped `ImageData` mask and avoids creating an
unbounded canvas per pointer event. It retains the existing last-render-wins
behavior while the pointer is down.
Pointer capture and `touch-action: none` remain required for touch and pen
strokes; `pointercancel` must discard the preview without committing pixels.

### Pointer samples and hidden pages

The committed stroke depends only on the pointer samples, never on how often
animation frames run. Chromium aligns continuous input to frames: it delivers
at most one `pointermove` per frame and lists every sample since the previous
event in `getCoalescedEvents()` (the last entry is the event itself). A hidden
tab or app pane gets no or very rare frames, so a whole stroke can arrive as a
few moves that each carry many samples, with the release flushing the rest.

- Every path-dependent tool applies each coalesced sample, oldest first, as
  its own move before the event's position (`precedingCoalescedSamples` in
  `src/pointerSamples.ts`; tool list `STROKE_SAMPLING_TOOLS` in
  `app/page.tsx`): Brush, Pencil, Eraser, Smudge, Blur, Sharpen, Dodge, Burn,
  Sponge, Clone, Healing, Spot Healing, Patch, Pattern Stamp, Red Eye, Color
  Replacement, Background Eraser, Mixer/History/Art History Brush, Mask
  Brush/Eraser, Adjustment Brush, Selection Brush, Quick Selection, Lasso,
  Magnetic Lasso, Freeform Pen and Quick Mask painting. Drag-to-size tools
  (shapes, marquees, crop, move, gradient) use only the latest position.
- A replayed move (one buffered while a trimmed paint layer grows) applies its
  client offset to every sample. Moves that arrive before a tool's buffer is
  ready are queued per sample and replayed in order.
- Stamping, smudging and other per-segment work is synchronous per sample.
  Only previews wait: buffer previews go through the one-per-frame preview
  scheduler, and tools whose preview is a direct render or a full
  recomputation (Lasso, Magnetic Lasso, Freeform Pen, Quick Selection,
  Selection Brush, mask refinement, Spot Healing, Patch) skip it for all but
  the last sample of an event.
- Release commits without waiting for a frame and includes every sample
  delivered before it; the preview catches up when frames resume.
- `tests/browser/stroke-input-background.spec.ts` pauses animation frames,
  reports the page hidden, delivers a 200-sample sine stroke as coalesced
  moves of 16 samples and requires the commit to be pixel-identical to the
  same stroke delivered visibly one sample per move, with the curve's peaks
  painted (Brush, Pencil, Eraser, Smudge, Dodge, Blur, Clone; desktop and
  mobile). `tests/pointer-samples.test.mjs` covers the sample helper.

## Acceptance tests

Add focused tests to `tests/browser/layers.spec.ts` (or a separate
`tests/browser/brush.spec.ts`) for both the `desktop` and `mobile` Playwright
projects. Each test should wait for `data-rendering="false"` and the saved
status before reading pixels.

1. **Settings round trip.** Select Brush, set Size, Hardness, and Opacity,
   download the project, assert the three values in `settings`, reload, and
   assert the controls retain them. Repeat with an older project fixture that
   omits the fields and assert defaults are used.
2. **Hardness pixel fixture.** Start a transparent document, paint two equal
   stamps with hardness 100 and hardness 0, and inspect alpha at the center,
   inner edge and outer edge. The hard stamp has an opaque center and a sharp
   boundary; the soft stamp has a nonzero center-to-edge gradient and reaches
   zero outside the radius. Use tolerance bands rather than exact browser
   antialiasing values.
3. **Opacity and eraser.** Paint the same stamp at 100% and 25% opacity, then
   erase once at 25%. Assert the center pixel changes monotonically and that
   the eraser removes only the requested fraction. Undo must restore the exact
   pre-stroke asset URL.
4. **Pen pressure fallback and opt-in mapping.** Dispatch a `pointerType: pen`
   stroke with pressure `0.2` and `0.8` while pressure controls are enabled;
   assert the resulting diameters/alpha differ in the expected direction. With
   pressure controls disabled, the same events must produce the configured
   diameter and opacity. Dispatch a mouse event with pressure `0` and assert it
   uses the full configured values.
5. **Touch continuity and cancellation.** On the mobile project, draw a
   `pointerType: touch` stroke across the canvas and verify no page scroll
   occurs, then send `pointercancel` and assert the asset/history and exported
   pixels are unchanged. A completed touch stroke must commit exactly once.
6. **Clone/healing invariants.** Set a source point, paint with different
   hardness/opacity values, and assert the offset is constant, edge alpha follows
   hardness, the original source asset remains present, and undo/reload preserve
   the committed result. Option/Alt-click a second source between strokes and
   verify only the next stroke uses the re-anchored offset; the source click does
   not add history. Healing must be bounded to the stroke mask and must not blur
   unrelated pixels.

## Risks and non-goals

- Canvas 2D color interpolation and device pixel ratio can vary at antialiased
  boundaries. Pixel tests must sample interior/edge/outside bands and use
  ranges, not a single exact edge byte.
- Full-canvas buffers currently make large strokes memory-heavy. Do not raise
  the image or brush-size limits until a measured mobile budget and tile/worker
  design are available.
- Pressure support is progressive enhancement. It must never require a pen,
  permission, sign-in, or a remote service; mouse and touch remain complete
  input paths.
- Brush settings change future strokes. Existing raster assets must not be
  re-rendered when a setting changes, and the original asset must stay
  recoverable through undo and project export.

The bounded tip/preset milestone is complete when the UI controls, validated
persistence, shared stamp implementation, desktop/mobile tests, and protected
CI/live revision evidence all pass. It does not claim Photoshop-equivalent
brush simulation, scattering, texture, dual-brush behavior, color dynamics,
transfer/pose/noise, wet edges, build-up, protect-texture, mixer behavior, wet-
media behavior, or pressure curves; those controls remain staged behind a
separate worker/tile rendering contract.

## Selection confinement

With an active selection, Brush, Pencil and Eraser change pixels only inside
it, as in Photoshop. At pointer-down the selection is sampled once in the
layer's own pixel space (so transformed layers, feathered and inverted
selections work), and the stroke is painted into an unconfined copy. After
each segment only the rectangle its dabs can reach (stamp radius, maximum
scatter and a pixel of margin) is blended over the stroke-start pixels by the
selection coverage, premultiplied, into the visible buffer. The live preview
and the committed asset are therefore the same pixels, and a feathered edge
receives proportional paint however often it is overpainted. Mask Brush, Mask
Eraser and Adjustment Brush confine layer-mask painting the same way in canvas
space. Quick Mask edits the selection itself and is not confined. Without a
selection every tool takes the previous, unconfined path with no extra work.

Sampling the selection is a whole-layer pass at stroke start, the same cost
Gradient, Paint Bucket and the retouch tools already pay.

Clone Stamp, Healing Brush, Pattern Stamp, Red Eye, Color Replacement and
Background Eraser use the same confined stroke (`confinedGestureEdit` in
`app/page.tsx`): each segment is drawn into the unconfined copy, reading the
immutable stroke-start source, and only the rectangle it can reach is blended
back by selection coverage, so preview and commit match. Magic Eraser, like
Fill, ignores clicks outside the selection and blends its result by coverage.
Smudge, Blur/Sharpen, Dodge/Burn/Sponge and Mixer/History/Art History brushes
already applied the layer-space selection mask through their own pixel
kernels. Spot Healing and Patch store nondestructive stroke metadata that is
rendered later, so at pointer-down they capture the active selection — any
shape (rectangle, ellipse, lasso, polygon, pixel mask), feathered or
inverted — as a layer-space alpha asset and store its id on the stroke
(`selectionMask`). Replay scales every write by that coverage, so the stroke
stays inside the selection after Deselect, undo/redo, reload and project
import (see `spot-healing-contract.md` and `patch-tool-contract.md`).

Option/Alt-click on Clone or Healing sets the source without touching pixels
or history and is handled before the in-flight gesture guard, so a source
chosen while the previous stroke is still decoding or committing (2646×4096
documents) is honoured by the next stroke; a stroke already in flight keeps the
anchor it started with. A white crosshair (`clone-source-marker`) shows the
source on the canvas while Clone or Healing is active.

"Mask from selection" consumes the selection as Photoshop does: one undo step
adds the mask and deselects (Select > Reselect restores it), so the new mask
can be painted outside the old selection straight away.

Evidence: `mixRectByMask`, `brushStampReach` and `brushSegmentRect` in
`src/selectionClip.ts` with `tests/selection-clip.test.mjs`,
`tests/browser/brush-selection.spec.ts` on desktop and mobile (brush with live
preview and undo, eraser, pencil with an inverted selection, feathered edge,
no-selection stroke, Mask Eraser), and `tests/browser/retouch-selection.spec.ts`
on desktop and mobile (Clone across a rectangular selection with live preview
and undo/redo, feathered Clone edge, Healing, Pattern Stamp and Color Replace
confinement, Alt-click source during a pending commit on a 2646×4096 poster,
Mask from selection then Mask Brush outside with one-step undo/redo).

Painting Size up to 5000 px shipped in #187 (`6a42943`). Spacing and scatter
above 100%, count and count jitter and a true pen lift at pressure 0 shipped in
#194 (`5b7bc63`); symmetric count jitter in #201 (`521188b`). Selection
confinement and the kept Alt-click source above shipped in #196 (`137ef33`).
See [`brush-dynamics-contract.md`](./brush-dynamics-contract.md).

Fix wave 3 added per-dab Hue / Saturation / Brightness / Foreground-Background
colour jitter and a brush preset library with four space-art built-ins (#209,
`7516d33`; [`custom-brush-presets-contract.md`](./custom-brush-presets-contract.md)),
Paint Symmetry for Brush, Pencil and Eraser (#210, `0ad0e69`;
[`paint-symmetry-contract.md`](./paint-symmetry-contract.md)) and Layer →
Stroke Path with Brush with simulated-pressure tapers for Brush, Pencil,
Eraser and Smudge (#212, `513779d`). Paint Symmetry now also applies to
Stroke Path with Brush (Brush, Pencil, Eraser; the 20,000-dab budget covers
all copies), Mixer Brush, History and Art History Brush, Clone Stamp and
Healing Brush (each copy samples a source point mapped by the same
transform); Spot Healing and Patch stay single-copy; Smudge has its own symmetry, with Strength, Mode, Finger Painting, Sample All Layers, tip angle/roundness, pressure size/strength, scatter/count and presets (see [`smudge-tool-contract.md`](./smudge-tool-contract.md) and
[`paint-symmetry-contract.md`](./paint-symmetry-contract.md)). Brush and Pencil have a **Mode** (blend mode) option (W4-3); see
"Brush and Pencil Mode" in
[`brush-dynamics-contract.md`](./brush-dynamics-contract.md). Open (fix wave
4 in the rubric): there are no custom brush tip shapes.
