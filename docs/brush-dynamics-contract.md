# Brush dynamics contract

Brush, Pencil and Eraser expose a persisted **Scatter** setting from 0 to
100%. Each stamp receives a deterministic local offset derived from its sample
position and bounded by the brush diameter. Zero is an exact unscattered path;
replaying the same pointer samples produces the same pixels without consuming
global randomness. The source asset remains immutable until pointer-up commits
one undoable raster edit.

The setting is validated in draft storage, defaults to zero for older
documents, remains anonymous/offline, and is covered by pure bounds and
determinism tests plus desktop/mobile project-file acceptance. This is a small
local scatter primitive; texture, dual-brush, bristle and wet-media dynamics
remain explicitly staged.
