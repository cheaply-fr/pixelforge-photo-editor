# Brush, eraser, clone and healing contract

This document defines the raster-tool behavior required for the next paint and
retouch increment. It is intentionally separate from the document format: the
document stores user preferences, while an accepted stroke commits an
immutable PNG asset and remains undoable.

## Current implementation audit

The editor exposes `size`, `hardness` and `brushOpacity` for Brush, Pencil, Eraser,
Clone and Healing. All four raster paths now use the same bounded local radial
stamp primitive; no full-canvas mask is allocated for an individual pointer
event. Mouse and unusable pen/touch pressure use a deterministic fallback of
`1`. Pen and touch pressure affect diameter and opacity only when their separate
opt-in controls are enabled. Brush and Eraser use radial alpha coverage,
Clone keeps a fixed source offset, and Healing uses the same mask with its
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

## Persisted tool state

Extend `Settings` with validated, backward-compatible values:

| Property | Range | Default | Meaning |
| --- | --- | --- | --- |
| `brushOpacity` | 1–100 (percent) | 100 | Maximum alpha for Brush, Eraser, Clone and Healing stamps |
| `hardness` | 0–100 (percent) | 100 | Radius at which a stamp reaches full alpha; 0 is a fully soft edge and 100 is a hard circle |
| `pressureSize` | boolean | false | Apply supported pen pressure to diameter |
| `pressureOpacity` | boolean | false | Apply supported pen pressure to stamp alpha |

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

1. Clamp pointer pressure to `[0, 1]`; use `1` when the event pressure is
   missing or zero for a mouse/touch fallback.
2. If `pressureSize` is enabled, multiply the configured diameter by pressure
   (with a documented minimum diameter, for example `0.25 × size`); otherwise
   retain the configured diameter.
3. If `pressureOpacity` is enabled, multiply `brushOpacity / 100` by pressure;
   otherwise use the configured opacity.
4. Render a circular alpha mask. For hardness `h`, use an inner radius of
   `radius × h / 100` at alpha `1` and a smooth radial falloff to alpha `0` at
   `radius`. Hardness 100 may use the existing filled circle fast path.
5. Composite the color through that mask with `source-over` for Brush/Clone/
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
   the committed result. Healing must be bounded to the stroke mask and must not
   blur unrelated pixels.

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

The radial stamp milestone is complete when the UI controls, validated
persistence, shared stamp implementation, desktop/mobile tests, and protected
CI/live revision evidence all pass. It does not claim Photoshop-equivalent
brush simulation, mixer behavior, wet-media behavior, or pressure curves.
