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
- `Ctrl/⌘+0` fits and `Ctrl/⌘+1` shows 100% (as do `Ctrl/⌘ +/−` step the
  zoom); the editor calls `preventDefault` so the browser's page zoom never
  takes these keys.
- The Zoom tool options offer Zoom In / Zoom Out mode (Alt-click inverts
  it), 100%, Fit Screen, Fill Screen (`fillViewZoom`: the smallest zoom at
  which the image covers the stage, one axis overflowing) and an opt-in
  Scrubby Zoom (`scrubbyViewZoom`: dragging right doubles the zoom every 160
  CSS px, left halves it). Mode and Scrubby Zoom persist with the draft
  settings (see [navigation tool options](./navigation-tool-options-contract.md)).
- The zoom control is pinned to the visible stage: it sits on a
  non-scrolling `.stage-shell` around the scrolling `.stage`, so it never
  floats mid-canvas or scrolls out of view.
- At 200% and above the canvas uses `image-rendering: pixelated` so pixels
  read as crisp squares.
- The slider value is a preset index; its `aria-valuetext` and the visible
  readout give the percentage, for example `12.5%`.

## Touch: pinch zoom and pan

- Two fingers on the canvas zoom and pan (`src/pinchZoom.ts`). The zoom is
  the start zoom times the change in finger distance (never measured from
  less than 12 CSS px), clamped to 1–3200%. The image point under the
  fingers' midpoint when the pinch began stays under their current midpoint,
  so spreading zooms in about that point and moving both fingers pans. Pan is
  the stage's scroll position, as with the Hand tool and scroll bars; the
  point can only stay fixed while the stage has room to scroll (an image
  smaller than the stage stays centred).
- Native capture-phase listeners on `.stage` track touch pointers that land
  on the canvas (or its wrapper or the stage background). When a second
  finger lands, the first finger's tool gesture is aborted with a synthetic
  `pointercancel`: a stroke, move, marquee or Quick Mask stroke in progress is
  rolled back and adds no history step. Click-to-place paths (polygonal
  lasso, Pen, Curvature Pen) get a synthetic `pointerup` instead, so the
  anchors already placed are kept. The second finger and every later contact
  never reach a tool until all fingers have lifted; putting a second finger
  back while one is still down starts a new pinch. A primary pointerdown
  (`isPrimary`) starts a fresh session, so a contact whose release was lost
  cannot turn the next one-finger press into a pinch.
- Updates are applied once per animation frame; the canvas width transition
  is off while pinching (`.stage[data-pinching]`). The zoom readout and
  slider follow the zoom; the status line reads `Pinch zoom: N%` at the end.
  A pinch changes the view only: no pixels and no history.
- `.stage` has `touch-action: pan-x pan-y` (one finger still scrolls around
  the image, the browser never page-zooms the stage) and the canvas keeps
  `touch-action: none`. The stage disables text selection and the touch
  callout except in its inputs and text areas. Panels and sheets outside the
  stage keep their default touch behaviour.
- Mouse and pen input are unchanged; Ctrl/⌘ + wheel and trackpad pinch
  (delivered as Ctrl + wheel) still zoom around the pointer.

## Touch: Move tool long-press

- With the Move tool, a touch held still for 500 ms on the canvas selects the
  top layer with pixels under the finger without moving anything (the same
  action as a right-click). It runs from a timer rather than relying on the
  browser's long-press `contextmenu`, which iOS Safari never fires and which
  Chromium does not fire for DevTools-injected touches; a `contextmenu` that
  does arrive while a finger is down is cancelled and triggers the pick early,
  so the native menu or callout never covers the canvas.
- Travel beyond 10 CSS px cancels the long-press, and a Move tool touch must
  travel beyond the same slop before the layer starts to move, so finger
  jitter during a long-press neither nudges the layer nor blocks the pick.
  A short tap, or a second finger (pinch), cancels it too.

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
- `tests/navigation-tool-options.test.mjs`: Fill Screen and Scrubby Zoom
  maths; `tests/browser/audit-nav-zoom-view.spec.ts` (desktop and mobile):
  pinned zoom control while scrolled at ≥ 200%, Zoom options, Alt inversion,
  Scrubby drag, persistence and `Ctrl+0`/`Ctrl+1` with `defaultPrevented`.
- `tests/browser/pixel-zoom.spec.ts` (desktop and mobile): fitted open,
  Actual size at 1 CSS px per image px, a 2646×4096 canvas fitted, shown at
  100% and scrolled to both corners, 1%/3200% clamps and crisp pixels,
  painting at 800% landing on the image pixel under the pointer, Zoom tool and
  Ctrl+wheel anchoring, and reload persistence with unchanged pixels.
- `tests/pinch-zoom.test.mjs`: pinch zoom ratio, clamping, anchored point and
  scroll maths, touch session rules (second finger, third finger, leftover
  finger, re-pinch, lost releases) and long-press slop.
- `tests/browser/pinch-zoom.spec.ts` (desktop with `hasTouch` and mobile
  Pixel 7): spread and pinch around a fixed midpoint, two-finger pan, 1%/3200%
  clamps, a brush stroke cancelled by a second finger with no pixels or
  history step and no painting from the leftover finger, then normal
  one-finger painting; canvas `touch-action`/`user-select` styles. Mobile
  only: Move tool long-press picks the layer under the finger without moving
  pixels, a short tap and travel beyond the slop do not, jitter within the
  slop neither moves the layer nor blocks the pick, and every `contextmenu`
  fired during a touch is cancelled.
- Touches are injected with the Chrome DevTools Protocol
  (`Input.dispatchTouchEvent`), which goes through Chromium's input pipeline:
  trusted `pointerType: 'touch'` events with implicit capture and
  `isPrimary`. This is emulation, not a device: real Android Chrome, iOS
  Safari and tablet hardware (palm rejection, OS gestures, the browser's own
  long-press timing) have not been tested.
