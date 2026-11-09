# Scrollbar contract

PixelForge's panels (tool rail, inspector, layers list, dialogs, flyouts) use
thin scrollbars that stay out of sight until they are useful, similar to
macOS overlay scrollbars.

## Behaviour

- Every scroller keeps a thin 8px gutter. Chromium and Safari show no arrow
  buttons and no track. Firefox uses `scrollbar-width: thin`.
- The thumb is transparent while the scroller is idle.
- The thumb shows (white, 24% opacity) while:
  - a mouse or pen is over that scroller (`data-scroll-hover`, mirrored from
    the pointer by `src/scrollbarActivity.ts` because Chromium does not
    repaint scrollbar styles on `:hover` alone; touch never counts);
  - the scroller is keyboard-focused (`:focus-visible`);
  - the scroller is scrolling by any means (wheel, touch, keys or code), and
    for 900 ms after the last scroll event (`data-scrolling`, set by
    `src/scrollbarActivity.ts`).
- Hovering the thumb brightens it to 42%; dragging it brightens it to 56%.
- In forced-colors (high contrast) mode the thumb is always visible and uses
  system colours.
- Utilities that hide scrollbars (`no-scrollbar`, `scrollbar-none`) still
  win, because these rules live in the CSS `base` layer.
- Unlike macOS, the thin gutter still takes its 8px of width, so content
  never shifts when the thumb appears. Chromium no longer supports scrollbars
  that overlay content.

The tool rail and tool flyouts also turn off text selection, so a drag across
them cannot highlight tool labels.

## Evidence

- `tests/scrollbar-activity.test.mjs`: the scroll-activity timing, target
  resolution, hover tracking, cleanup and the CSS rules.
- `tests/browser/scrollbars.spec.ts`: desktop and mobile. Checks that the
  thumb is hidden when idle and shown on hover and while scrolling, that the
  `data-scrolling` lifecycle works, that the gutter is 8px, and that tool
  labels cannot be selected.
