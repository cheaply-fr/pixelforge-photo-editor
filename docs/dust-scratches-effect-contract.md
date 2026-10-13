# Dust & Scratches effect contract

`Filter → Noise → Dust & Scratches…` is a bounded, nondestructive local outlier-cleanup approximation.

- The renderer computes a visible-pixel median in a square neighbourhood, then replaces only pixels whose largest RGB distance from that median exceeds the editable threshold. Radius is clamped to `1..8`, threshold to `0..255`, and amount to `0..100`.
- Alpha is copied from the source. Fully transparent pixels retain their original hidden RGB, and source asset bytes are never mutated.
- The effect is stored in editable `filterEffects` metadata and survives undo, reload and project export/import. Locked or unavailable layers remain unchanged through existing command guards.
- This is not Photoshop's full dust/scratch detector: frequency-aware edge preservation, channel-specific thresholds and high-bit-depth behaviour remain staged.
