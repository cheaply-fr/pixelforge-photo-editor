# Facet effect contract

PixelForge's **Filter → Pixelate → Facet…** command is a bounded,
nondestructive local approximation of Photoshop Facet. It stores only
validated `filterEffects` metadata (`type: facet`, `amount`, `radius` and
`seed`) on the active layer; the source asset is never replaced.

The renderer divides each cell into four deterministic triangles around its
centre. Each triangle receives an alpha-weighted colour average from the
immutable source and visible pixels blend toward that colour by `amount`.
Cell size is bounded to 1–64 px (the renderer uses a minimum 2 px cell),
dimensions remain unchanged, source alpha is copied byte-for-byte and fully
transparent RGB padding is not sampled or rewritten. The seed rotates the
triangle partition per cell, so output is reproducible and changing the seed
provides a stable alternate facet layout. Amount 0 and radius 0 are identity
operations.

Pure pixel/metadata tests and desktop/mobile browser acceptance cover
determinism, representative pixels, boundary and transparent-edge safety,
source-asset identity, undo, reload/project round trips, Action replay and the
accessible Filter menu. This is a local cell approximation; Photoshop's exact
edge reconstruction and Mezzotint/Fragment variants remain staged.
