# Paint symmetry contract

Brush, Pencil, Eraser, Mixer Brush, History Brush, Art History Brush, Clone
Stamp and Healing Brush expose one shared, persisted **Symmetry** group in
their tool options (the list is `PAINT_SYMMETRY_TOOLS` in
`src/paintSymmetry.ts`), and Layer → Stroke Path with Brush honours it for
Brush, Pencil and Eraser. Modes: Off, Vertical axis, Horizontal axis, Dual axis, Diagonal, Radial
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
  Colour dynamics (hue/saturation/brightness/mix jitter) are resolved once
  per source dab and shared by every copy. Paper-fixed modulation (Texture,
  Dual brush, Bristle) is evaluated at each
  copy's own position. A secondary brush tip keeps its own preset angle.
- The symmetry set is fixed at pointer-down for the whole stroke. All copies
  paint into the same stroke buffer; with an active selection each copy's
  transformed segment rectangle is confined, so the live preview equals the
  commit. A stroke with all its copies is one undo step.
- Off sends no transforms and uses the unchanged single-dab path.
- Settings persist with the document's editor settings (draft and project
  file) and are validated on load; malformed values reject the draft as
  other invalid settings do. Older drafts default to Off.

## Stroke Path with Brush (W4-1)

- Layer → Stroke Path with Brush… applies the current symmetry settings when
  the stroke tool is Brush, Pencil or Eraser, exactly like a hand-drawn
  stroke of that tool: the transforms are resolved for the target layer
  (`M⁻¹ · T · M`), every resolved path dab (after simulated pressure,
  scatter, count and jitter) is replicated, copies share the source dab's
  seeded jitter and colour dynamics, and mirrored copies mirror the tip.
- The active selection is applied once to the whole stroked buffer, so every
  copy is confined by the same layer-space mask. The command with all its
  copies stays one undo step; the notice reports the number of copies.
- Dab cap: the 20,000-dab budget covers all copies. The path is sampled with
  at most `floor(20,000 / copies)` positions (`strokePathMaxSamplesForCopies`),
  so spacing widens (with the usual notice) instead of a Mandala 64 stroke
  painting up to 128 × 20,000 dabs. Brush Count still multiplies dabs per
  position, as for a pointer stroke.
- Smudge has no symmetry (neither as a pointer tool nor as a stroke-path
  tool) and is unchanged. With symmetry Off no transforms are passed and the
  unchanged single-copy path runs, so legacy strokes are byte-identical.

## Mixer Brush, History Brush and Art History Brush (W4-4)

- The symmetry set is fixed at pointer-down. Each pointer segment's point
  list is replicated per copy (`symmetryStrokePointCopies`) and applied in
  transform order onto the same buffer (`applySymmetricRetouchBrush` in
  `src/mixerHistoryBrush.ts`), so later copies see earlier copies' paint just
  as later points of one stroke do. Each copy samples its own position:
  Mixer picks up the canvas there, History and Art History read the chosen
  snapshot there. The selection mask is per pixel, so every copy is confined.
- Art History's tip angle and handedness are mirrored per copy. Its local
  work budget (1,000,000 candidate pixels per request) covers all copies
  together: a request over the budget is refused with the usual notice
  rather than silently shrunk.
- Mixer and History coverage is round (their dab ignores tip angle), so only
  positions change. Copies are applied per copy, so the 2,048-point limit per
  request applies to each copy's list, not to the total.

## Clone Stamp and Healing Brush (W4-4)

- Rule: **the same transform maps the destination dab and its source sample
  point.** A copy at `T(d)` samples around `T(s)`, so its source offset is the
  original offset turned or mirrored by the copy's linear part:
  `T(s) − T(d) = L · (s − d)` (`symmetryCloneCopies`). For a vertical mirror
  an offset of (+200, −100) becomes (−200, −100); for Radial 4 the offset
  turns by 90° per copy.
- Pixels around that source point are copied unflipped (each copy is an
  ordinary clone/heal dab at its own position); mirrored copies only mirror
  the tip shape. All copies sample the stroke-start snapshot, so a copy never
  clones another copy's paint. Healing blends at each copy's own destination.
- Selection confinement is per copy (each copy's transformed segment
  rectangle), live preview equals the commit, and a stroke with all copies is
  one undo step. The Option/Alt-click source and its marker are unchanged.

## Not covered: Spot Healing and Patch

Spot Healing and Patch do not show or apply symmetry. Both store their
strokes as non-destructive, versioned records on the layer (at most 128
Spot Healing strokes or `PATCH_MAX_STROKES` Patch strokes per layer) that are
replayed on render and reload. Replicating a gesture would multiply records
(a Mandala 64 stroke would need 128 records and exhaust the per-layer limit
at once) or require a record-format change carrying the transforms, and Spot
Healing's content-aware sampling around each copy is not a geometric image of
the source stroke. They stay single-copy until a bounded format exists.

## UI

The control is a compact fieldset (mode select, segments slider + number,
rotation slider, centre X/Y fields with a reset button, Show guides checkbox
and a copies-per-dab summary). The on-canvas overlay draws mirror axes or
segment rays and a 28 px centre handle that can be dragged (pointer or touch)
or nudged with arrow keys (Shift for ten pixels, Home to recentre).

## Limits

Spot Healing, Patch, Smudge (pointer and stroke path), Pattern Stamp, Red
Eye, toning, Blur/Sharpen, Color Replace, Background/Magic Eraser and the
mask/adjustment brushes do not use symmetry. Copies on a non-uniformly scaled
layer keep the source dab size.
This is a bounded local approximation of symmetry painting, not a claim of
parity with any other application.

## Verification

`tests/paint-symmetry.test.mjs` covers each mode's transforms, segment counts,
centre/rotation, mirror handedness and pixel-exact mirrored/rotated stamps,
layer-space conjugation, bounds, determinism and draft validation.
`tests/browser/paint-symmetry.spec.ts` covers desktop and mobile radial 8,
axis/dual/mandala strokes, centre drag/keyboard/field edits with the Eraser,
selection confinement, undo/redo, Off pixel identity and reload.
`tests/paint-symmetry-tools.test.mjs` covers the tool list, clone source
mapping (offset rule for every mode, layer conjugation), point-list copies,
per-copy tip orientation, Off/identity byte-identity for Mixer, History and
Art History, mirrored History restores, Mixer copy ordering, Art History tip
mirroring and shared work budget, per-copy selection masks, and the Stroke
Path sample budget per copy count. `tests/browser/paint-symmetry-tools.spec.ts`
covers desktop and mobile Stroke Path with Brush (vertical mirror with
undo/redo; Radial 4 confined to a selection; Off paints one copy), History and
Art History mirror restores, a Dual-axis Mixer stroke as one undo step, Clone
Stamp with a mirrored source offset, and Healing Brush copies with selection
clipping (Spot Healing and Patch show no symmetry controls).

## Smudge (2026-11-09)

Branch `feat/smudge-tool-options`. Smudge shows the same **Symmetry** group and
on-canvas guides. Every copy is the geometric image of the (scattered,
jittered) Smudge dab, as for Brush, and carries its own paint load, loaded at
the copy's own first dab; see [`smudge-tool-contract.md`](./smudge-tool-contract.md).
Pure evidence: the mirrored-stroke and dual-axis windowed tests in
`tests/smudge.test.mjs`.
