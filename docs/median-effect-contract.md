# Median effect contract

`Filter → Noise → Median…` is a bounded, nondestructive local noise-reduction approximation.

- The renderer samples a square neighbourhood around each visible pixel and takes the per-channel median. Radius is clamped to `1..8`; amount is clamped to `0..100` and blends the filtered result with the source.
- Alpha is copied from the source. Fully transparent pixels retain their original hidden RGB, and source asset bytes are never mutated.
- The effect is stored in editable `filterEffects` metadata and survives undo, reload and project export/import. Locked or unavailable layers remain unchanged through the existing command guards.
- This increment does not claim Photoshop's full edge-aware, channel-specific or high-bit-depth Median implementation; those remain staged.
