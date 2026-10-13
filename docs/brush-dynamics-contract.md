# Brush dynamics contract

Brush, Pencil and Eraser expose persisted **Scatter**, **Dual brush** and
**Bristle** settings from 0 to 100%. Scatter gives each stamp a deterministic
local offset derived from its sample position and bounded by the brush diameter.
Dual brush and Bristle apply bounded deterministic opacity modulation to each
stamp. All zero values are exact identities; replaying the same pointer samples
produces the same pixels without consuming global randomness. The source asset
remains immutable until pointer-up commits one undoable raster edit.

The settings are validated in draft storage, default to zero for older
documents, remain anonymous/offline, and are covered by pure bounds and
determinism tests plus desktop/mobile project-file acceptance. These are bounded
local dynamics; full Photoshop secondary tip selection, physical bristle
geometry and wet-media simulation remain explicitly staged.
