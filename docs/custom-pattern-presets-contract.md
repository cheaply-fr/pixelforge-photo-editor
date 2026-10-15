# Custom pattern presets contract

`Edit → Define Pattern…` captures the current Pattern Stamp source, tile size,
foreground and background wells into a named local preset. Presets contain no
source pixels or remote references; they reuse the bounded deterministic
Pattern Stamp vocabulary (`checker`, `stripes`, `dots`, `grid`, `diagonal`) and
tile sizes from 4–128 pixels. A maximum of 32 presets is retained in anonymous
draft settings.

The saved-pattern selector is available for Pattern Stamp, survives reload and
portable project export, and applies the complete captured configuration.
Empty names and malformed colors, IDs or tile sizes are rejected before any
draft or history mutation. Pure tests cover validation, normalization,
duplicates and the limit; desktop/mobile acceptance covers authoring, invalid
input, export and reload.
