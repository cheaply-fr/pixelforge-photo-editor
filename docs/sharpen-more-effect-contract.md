# Sharpen More effect contract

`Filter > Sharpen > Sharpen More` is a distinct nondestructive local effect.
It applies two bounded Gaussian-reference unsharp passes to the rendered layer.
The two-pass composition is intentionally separate from `Unsharp Mask`: with
the same amount and radius it produces a stronger, deterministic result while
remaining editable in `filterEffects` metadata.

The renderer never mutates source assets. Visible RGB channels are updated,
alpha bytes remain unchanged, and RGB values under fully transparent pixels
remain untouched. Amount is clamped to 0–100 and radius to 0–64 source pixels.
The implementation is a bounded local approximation; edge-aware halo
suppression, threshold controls and Photoshop equivalence are not claimed.

Acceptance requires deterministic pixels, a stronger edge response than one
pass for a high-contrast fixture, transparent-pixel preservation, metadata
validation, source-asset retention, undo/reload round trips, and desktop/mobile
menu coverage.
