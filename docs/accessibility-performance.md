# Accessibility and motion contract

PixelForge keeps the editor usable with a keyboard, a touch device, and an
operating-system reduced-motion preference. This contract covers the shared
shell; individual tools retain their own pointer and persistence contracts.

## Keyboard focus

- Every native button, link, form control, and explicit tab stop receives a
  `:focus-visible` ring with a 2px cyan outline and a 3px offset. The ring is
  drawn on the control itself so it remains visible in both the two-column and
  three-column tool palettes.
- Pointer focus does not add a persistent ring. Keyboard focus is still
  visible when the control has a transparent background or an existing
  component rule that removes the browser default outline.
- Menu roving focus (Arrow keys, Home/End, Escape and Tab) remains the source
  of truth for Photoshop-style menus. The desktop and mobile browser suite
  checks that keyboard focus is visible after navigation.

## Reduced motion

`prefers-reduced-motion: reduce` disables decorative transitions and animation,
turns smooth scrolling off, and removes the canvas width transition. Editing,
render completion, keyboard focus, pointer input, and status updates continue
to work; this preference never disables an editing command.

## Performance evidence and limits

The performance browser test attaches a repeatable startup, raster-stroke, and
PNG-export measurement for both desktop and mobile Playwright projects. The
measurements have generous 30-second watchdogs because CI hardware varies;
they are evidence for regressions, not a universal device guarantee.

Rendering uses a Canvas2D surface and last-render-wins sequencing. Committed
frames may now use bounded Worker/OffscreenCanvas rendering through a full-frame
path with
cooperative cancellation and a monotonic completed-layer status; the same
status and cancellation guard the Canvas2D fallback. The documented 16
megapixel canvas, 64 megapixel raster-frame, 64 MiB portable project, and 64
megapixel decoded-cache limits are safety budgets. Worker image encoding now
uses the shared bounded row-major tile schedule (16 MiB expanded-RGBA batch
budget, 64 MiB hard ceiling), while document rendering still publishes a
full-frame result for unsupported effects. The visible adapter routes bounded
the bounded local effect allow-list through one expanded tile at a time under a retained-byte
ledger and proves neighbourhood pixel parity against a full-frame oracle.
Committed renders reuse one worker with latest-wins cancellation and idle
teardown; partial-pixel streaming, device cache policy and physical telemetry
remain planned follow-up work and are not implied by this contract.
Eligible local-effect renders additionally expose a monotonic bounded tile
progress sample to the render-status diagnostics. This is work progress only;
the editor still publishes one complete frame after the worker result passes
dimension and ownership checks.

## Verification

`tests/accessibility.test.mjs` verifies that the source stylesheet and this
contract retain the focus and reduced-motion rules. The browser acceptance
spec `tests/browser/accessibility.spec.ts` runs in the configured desktop and
mobile projects and verifies a visible keyboard focus ring, reduced-motion
computed styles, and continued menu/editor usability.
