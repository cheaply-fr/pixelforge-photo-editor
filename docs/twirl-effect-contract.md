# Twirl effect contract

`Filter → Distort → Twirl…` is a local, nondestructive approximation. The
effect stores a bounded angle, amount, radius and normalized centre in the
layer adjustment metadata; source assets remain immutable and undo restores
the prior adjustment frame.

Each visible destination pixel inside the influence radius inverse-maps to a
quadratically tapered rotation around the centre. Sampling uses the shared
premultiplied-alpha bilinear path, so transparent RGB padding does not bleed
into visible edges. Alpha bytes are retained from the destination source
pixel, and the renderer is deterministic for identical metadata.

The contract is covered by pure determinism, source-retention, transparent
edge and validation tests, plus desktop browser persistence and reload
acceptance. Full Photoshop mesh/liquify semantics, smart-object acceleration
and worker/tile processing remain outside this bounded local contract.
