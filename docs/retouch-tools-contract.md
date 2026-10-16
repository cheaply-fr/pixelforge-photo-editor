# Blur and Sharpen brush contract

PixelForge exposes local Blur and Sharpen brush tools beside Smudge in the
Retouch category. They share Photoshop's `R` family and the hold/right-click
flyout, while remaining separate active tools with their own Lucide icons.

## Pixel and safety behavior

- A gesture decodes one immutable source snapshot and edits a detached
  destination buffer. Blur uses a bounded local box average; Sharpen applies a
  bounded source-safe high-pass contribution. The source asset is never
  mutated.
- Size, hardness, flow/opacity and the current selection alpha constrain each
  stroke segment. Destination alpha is preserved exactly, and transparent
  source pixels do not introduce hidden RGB.
- Invalid buffers, geometry, settings and masks fail closed. A stationary or
  fully unselected gesture is a no-op and does not create a history frame.
- Visible, unlocked raster layers are required. Locked, hidden, text and vector
  layers report a guard message without changing the draft. Pointer cancellation
  discards the preview and stale document ownership cannot commit it.

## Interaction and persistence

The compact toolbar groups Smudge, Blur and Sharpen behind one R-family
representative with the Photoshop-style bottom-right arrow. The flyout keeps
the selected subtool and renders each subtool's icon. Size, Hardness and Flow
are available in the inspector; each committed stroke is undoable and survives
reload and editable project export/import.

Pure coverage is in `tests/retouch.test.mjs`; desktop and mobile browser
coverage is in `tests/browser/retouch-tools.spec.ts` and includes flyout icons,
keyboard cycling, representative pixel changes, source retention, undo/redo,
reload, lock guards and no duplicate toolbar slots.

The browser path currently scans the active asset buffer per segment. Worker and
tile processing for interactive brush latency on very large images remains
staged behind the scale milestone.
