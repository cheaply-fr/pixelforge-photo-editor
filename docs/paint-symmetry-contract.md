# Paint symmetry contract

Brush, Pencil and Eraser expose a persisted **Symmetry** group in their tool
options: Off, Vertical axis, Horizontal axis, Dual axis, Diagonal, Radial
(2–64 segments) and Mandala (2–64 segments plus their mirror images, 2N
copies). An editable centre in canvas pixels (default: canvas centre, clamped
into the canvas) and a rotation (-180–180°, clockwise on screen like the brush
tip Angle) apply to every mode.

## Semantics

- Pure transforms live in `src/paintSymmetry.ts`. Each mode is a group of
  rigid transforms about the centre, identity first. They are expressed in the
  painted layer's asset space as `M⁻¹ · T · M`, so offset or transformed layers
  mirror about the same canvas point.
- Every resolved input dab (after scatter, count and size/angle/opacity
  jitter) is replicated through every transform. Copies **share** the source
  dab's deterministic jitter, so strokes stay exactly symmetric and
  repeatable. Rotated copies add the rotation to the tip angle; mirrored copies
  map the tip angle θ to 2α − θ for an axis at α and swap the tip's handedness.
  Paper-fixed modulation (Texture, Dual brush, Bristle) is evaluated at each
  copy's own position. A secondary brush tip keeps its own preset angle.
- The symmetry set is fixed at pointer-down for the whole stroke. All copies
  paint into the same stroke buffer; with an active selection each copy's
  transformed segment rectangle is confined, so the live preview equals the
  commit. A stroke with all its copies is one undo step.
- Off sends no transforms and uses the unchanged single-dab path.
- Settings persist with the document's editor settings (draft and project
  file) and are validated on load; malformed values reject the draft as
  other invalid settings do. Older drafts default to Off.

## UI

The control is a compact fieldset (mode select, segments slider + number,
rotation slider, centre X/Y fields with a reset button, Show guides checkbox
and a copies-per-dab summary). The on-canvas overlay draws mirror axes or
segment rays and a 28 px centre handle that can be dragged (pointer or touch)
or nudged with arrow keys (Shift for ten pixels, Home to recentre).

## Limits

Mixer Brush, History brushes, Clone/Healing and other retouch tools do not use
symmetry. Copies on a non-uniformly scaled layer keep the source dab size.
This is a bounded local approximation of symmetry painting, not a claim of
parity with any other application.

## Verification

`tests/paint-symmetry.test.mjs` covers each mode's transforms, segment counts,
centre/rotation, mirror handedness and pixel-exact mirrored/rotated stamps,
layer-space conjugation, bounds, determinism and draft validation.
`tests/browser/paint-symmetry.spec.ts` covers desktop and mobile radial 8,
axis/dual/mandala strokes, centre drag/keyboard/field edits with the Eraser,
selection confinement, undo/redo, Off pixel identity and reload.
