# Reduce Noise effect contract

`Filter → Noise → Reduce Noise…` is a bounded, nondestructive colour-weighted neighbourhood approximation.

- Each visible pixel is averaged with nearby visible samples weighted by spatial distance and RGB similarity. Radius is clamped to `1..8`, preserve-details threshold to `1..255`, and amount to `0..100`.
- Alpha is copied from the source. Fully transparent pixels retain their original hidden RGB, and source asset bytes are never mutated.
- The effect is stored in editable `filterEffects` metadata and survives undo, reload and project export/import. Locked or unavailable layers remain unchanged through existing command guards.
- This does not claim Photoshop's full camera-noise model, temporal denoising, dust reduction, edge-preserving algorithms or high-bit-depth behaviour.
