# Puppet Warp contract

PixelForge's **Edit → Puppet Warp…** command is a bounded, local approximation
for moving a raster or smart-object layer with one to eight editable pins. Each
pin is expressed in layer-local pixels as `x,y,dx,dy`; the implementation uses
a deterministic smooth inverse displacement with nearest-neighbour sampling.
It is deliberately source-safe: the committed source asset is never mutated,
transparent RGB padding is cleared, and one undoable replacement asset is
created only after the plan and dimensions validate.

The current contract is intentionally narrower than Photoshop's mesh and
rigid-region solver. It does not infer subjects, pin rigid regions, preserve
semantic edges, or provide a deformable mesh. Inputs are capped at eight pins
and 16 megapixels; malformed dimensions, buffers, non-finite coordinates and
out-of-bounds pins fail closed before allocation. Empty pins are a validated
identity plan.

Evidence is split across the pure `puppet-warp` tests (normalisation, bounds,
identity, deterministic movement, alpha safety, immutability and validation)
and desktop/mobile browser tests (menu enablement, prompt parsing, pixel
change, source-asset identity, undo/reload persistence and locked-layer guard).
CI, deployment and live revision checks remain separate release gates.
