# Field Blur contract

PixelForge's Filter > Blur > Field Blur command is an editable local effect. A
selected visible unlocked layer keeps its immutable source asset; the effect is
stored in `layer.adjustments.filterEffects` and is replayed on every render,
undo/redo, browser draft reload and project-file import.

A Field Blur record uses the existing bounded filter envelope plus
`fieldPoints`, an array of one to eight pins. Each pin stores normalized `x` and
`y` coordinates and a source-pixel `radius` from 0 through 64. The renderer
interpolates pin radii across the layer and applies a deterministic 25-sample
disc kernel at each destination. Amount controls the blend with the unfiltered
source. Alpha is preserved exactly and transparent RGB padding is never mixed
into visible pixels.

The implementation is intentionally a bounded Canvas 2D approximation. It does
not infer a depth map, reconstruct Photoshop bokeh highlights, expose per-pin
feather/shape controls, or use GPU acceleration. Maximum image dimensions and
pixel counts remain those of the document/filter contract; large neighborhood
work can be routed through the existing tiled path only for the box/Gaussian
families. These limits are shown in the inspector so users can distinguish the
local approximation from Photoshop equivalence.

Acceptance requires deterministic unit fixtures (including source immutability,
variable pin response, alpha and transparent RGB), desktop and mobile menu
coverage, editable pin metadata, undo, draft reload, project export/import and
source-asset retention. Deployment is reported separately from source and local
validation.
