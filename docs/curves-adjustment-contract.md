# Curves adjustment contract

`Image → Curves…` (and `Image → Adjustments → Curves…`) reveal the
nondestructive Curves controls for the selected layer or adjustment layer.
There is one editor per channel: composite **RGB**, then **Red**, **Green** and
**Blue**. The per-channel curves are applied after the composite curve.

## Editing

- **Add a point:** click or tap an empty spot on a channel graph. The point is
  placed at that input/output position and can be dragged straight away. A
  curve holds at most **14 interior points plus the two endpoints** (16 in
  total); further additions report the limit in the editor's status line.
- **Move a point:** drag it. Interior inputs are clamped strictly between the
  neighbouring points so the order never changes; outputs are clamped to
  0–255. The two endpoints keep their 0 and 255 inputs and move vertically
  only (no horizontal black/white-point clipping in this bounded editor).
- **Remove a point:** drag an interior point more than 32 px off the graph,
  double-click it, press Delete or Backspace while it is focused, or use the
  **Remove point** button for the selected point. Endpoints cannot be removed.
- **Keyboard:** every point is a focusable button named with its input and
  output. Arrow keys move the focused point by 1 level (Shift+Arrow by 10).
  The selected point also has numeric Input/Output fields; the Input field is
  disabled for endpoints.
- **Touch:** graphs use `touch-action: none`; touch hit targets are 24 px in
  radius (40 px handles on coarse pointers) versus 12 px for a mouse.
- **History:** a click, key press or field edit is one undo step. One pointer
  drag is also one undo step — later updates of the same drag amend the entry
  the drag created.
- The legacy **RGB midpoint** slider and per-channel **Reset** remain.

## Interpolation

New edits use a **monotone cubic** (Fritsch–Carlson) curve through the points:
it passes through every control point, stays monotone wherever the points are,
and never overshoots between two neighbours, so outputs never ring past their
control values.

Documents saved before smooth curves stored no interpolation field. To keep
them rendering identically, a curves record without an `interpolation` field
resolves to **linear** when any channel already has an interior point, and to
**monotone** otherwise (a two-point curve is the same straight line either
way, and two-point curves take the linear rounding path so their 8-bit output
is bit-identical). Normalising a document never writes this resolved value
back; the first curve edit stores `interpolation` explicitly. The **Smooth
curve interpolation** checkbox switches a layer between `monotone` and
`linear`.

## Storage and validation

`adjustments.curves` is `{ rgb, red, green, blue, interpolation? }`. Each
channel is an array of `[input, output]` integer pairs, sorted by strictly
increasing input, all within 0–255, starting at input 0 and ending at input
255. Validation rejects unsorted or duplicate inputs, non-integers, values out
of range, missing endpoints, more than 33 points (the long-standing stored
limit that older documents may use) and unknown `interpolation` values. The
editor itself never produces more than 16 points. No migration is needed.

Rendering compiles each channel to an 8-bit lookup table, preserves alpha and
transparent RGB data, and leaves the source asset unchanged.

## Tests

- `tests/curves.test.mjs`, `tests/curves-points.test.mjs`: point
  add/move/remove/cap, validation, monotonicity and no overshoot, endpoint
  behaviour, legacy linear equality and two-point identity between modes.
- `tests/browser/curves.spec.ts`, `tests/browser/curves-points.spec.ts`
  (desktop and mobile): add/drag/remove with mouse and touch, keyboard
  movement and deletion, per-channel independence, the 14-point cap, pixels
  matching the stored curve, one-step drag undo, redo and reload.

This is a bounded local Curves editor; it does not claim Photoshop parity
(no eyedropper targeting, per-channel black/white-point clipping, freehand
pencil curves or presets).
