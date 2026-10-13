# Despeckle effect contract

`Filter → Noise → Despeckle` is a bounded, nondestructive fixed-radius local cleanup approximation.

- The renderer uses a one-pixel visible-neighbour median and replaces strong local RGB outliers using the existing bounded amount control. The fixed radius and threshold keep the command predictable and inexpensive.
- Alpha is copied from the source. Fully transparent pixels retain their original hidden RGB, and source asset bytes are never mutated.
- The effect is stored in editable `filterEffects` metadata and survives undo, reload and project export/import. Locked or unavailable layers remain unchanged through existing command guards.
- Photoshop's texture-aware, edge-preserving despeckle detector and high-bit-depth behaviour remain staged.
