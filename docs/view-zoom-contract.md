# View zoom contract

The editor view zoom is a **true pixel percentage**: at 100% one image pixel
covers one CSS pixel, at 400% each image pixel covers 4×4 CSS pixels. Zoom is
a view setting only. It never changes document pixels, history or exports.

## Behaviour

- Range 1%–3200%. Zoom in/out (`+`/`-`, View menu, toolbar buttons, slider)
  walks Photoshop-style presets: 1, 2, 3, 4, 5, 6.25, 8.33, 12.5, 16.67, 25,
  33.33, 50, 66.67, 100, 150, 200, 300, 400, 600, 800, 1200, 1600, 2400, 3200.
  Off-preset values (for example a fitted 11.79%) step to the neighbouring
  preset in the chosen direction.
- `View → Actual size` and `1` set 100%. `View → Fit to screen` and `0` show
  the whole image inside the stage padding; fit never magnifies past 100%.
- New and opened documents, and drafts saved before this contract, open
  fitted. A draft saved with `viewZoom` reopens at that zoom.
- The canvas is sized as image width × zoom with no width cap. When the image
  is larger than the stage the stage scrolls, and both the top-left and
  bottom-right image corners are reachable.
- Zoom tool clicks (Alt zooms out) and Ctrl/⌘ + wheel keep the image point
  under the pointer fixed when the image overflows the stage. Keyboard,
  menu, button and slider zooms keep the stage centre fixed. An image smaller
  than the stage is centred.
- At 200% and above the canvas uses `image-rendering: pixelated` so pixels
  read as crisp squares.
- The slider value is a preset index; its `aria-valuetext` and the visible
  readout give the percentage, for example `12.5%`.

## Persistence

Settings keep the legacy `zoom` field (stage-width percent, 20–140) written as
72, so older builds still accept new drafts and open them at their default.
The new optional `viewZoom` must be a finite number in 1–3200; anything else,
including `null` or a string, rejects the settings.

## Evidence

- `src/viewZoom.ts` and `tests/view-zoom.test.mjs`: presets, stepping and
  clamping, validation, fit geometry, labels, anchored scroll maths.
- `tests/persistence-contract.test.mjs`: `viewZoom` round-trips and malformed
  values are rejected while legacy drafts stay valid.
- `tests/browser/pixel-zoom.spec.ts` (desktop and mobile): fitted open,
  Actual size at 1 CSS px per image px, a 2646×4096 canvas fitted, shown at
  100% and scrolled to both corners, 1%/3200% clamps and crisp pixels,
  painting at 800% landing on the image pixel under the pointer, Zoom tool and
  Ctrl+wheel anchoring, and reload persistence with unchanged pixels.
