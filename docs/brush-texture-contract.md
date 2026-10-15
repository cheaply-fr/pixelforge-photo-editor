# Brush texture contract

Brush, Pencil and Eraser expose a persisted **Texture** amount from 0 to 100%.
Each local stamp receives a deterministic opacity multiplier derived from its
canvas position; zero is an exact existing brush path, and replaying the same
pointer samples does not consume global randomness. The multiplier is bounded
and the original asset remains immutable until pointer-up commits one undoable
raster edit.

The setting is validated and backward-compatible for older drafts. Pure tests
cover clamping, determinism and opacity bounds; desktop/mobile acceptance
covers the accessible control and portable project round-trip. This is a
bounded opacity texture primitive, not Photoshop's full texture, dual-brush,
bristle or wet-media engine.
