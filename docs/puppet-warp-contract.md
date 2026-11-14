# Puppet Warp contract

PixelForge's **Edit → Puppet Warp…** command is a bounded, local approximation
for moving a raster or smart-object layer with one to eight editable pins. Each
pin is expressed in layer-local pixels as `x,y,dx,dy`; the implementation uses
a deterministic smooth inverse displacement with nearest-neighbour sampling.
It is deliberately source-safe: the committed source asset is never mutated,
transparent RGB padding is cleared, and one undoable replacement asset is
created only after the plan and dimensions validate.

Each pin has bounded influence. Its pull is centred on where the pin moves
to, so the pixel under the pin lands exactly on its target, and it fades with
a smooth compact falloff `(1 - (d / r)^2)^2` to zero at radius `r`. Pixels
farther than `r` from every pin's target do not move, so a single pin bends
the layer around itself instead of translating the whole layer. `r` is the
pin's influence (35% of the layer's shorter side from the Edit menu) or 1.6
times the pin's move, whichever is larger, so the warp never folds over
itself. Overlapping pins blend by weight and never move a pixel farther than
the pins themselves move.

The current contract is intentionally narrower than Photoshop's mesh and
rigid-region solver. It does not infer subjects, pin rigid regions, preserve
semantic edges, or provide a deformable mesh. Inputs are capped at eight pins
and 16 megapixels; malformed dimensions, buffers, non-finite coordinates and
out-of-bounds pins fail closed before allocation. Empty pins are a validated
identity plan.

Evidence is split across the pure `puppet-warp` tests (normalisation, bounds,
identity, deterministic movement, local falloff with untouched far pixels,
no fold-over, overlapping-pin blending, alpha safety, immutability and
validation)
and desktop/mobile browser tests (menu enablement, prompt parsing, pixel
change, a single pin leaving the layer's edges in place, source-asset identity,
undo/reload persistence and locked-layer guard).
CI, deployment and live revision checks remain separate release gates.
