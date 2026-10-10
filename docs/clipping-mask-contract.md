# Clipping mask contract

PixelForge stores a clipping relationship on the active raster or embedded
smart-object layer with `clippingTo`, pointing to the directly lower
pixel-producing layer in the same root or folder. The base may be raster,
smart-object, editable text, a parametric shape, a line, or a path. A path's
rendered alpha includes compound contours and even-odd holes.

Create and Release Clipping Mask are available from the Layer menu and Layers
panel. The source and base must be visible and unlocked. Each accepted action
creates one history entry; Undo and Redo restore the relationship. Reorder,
delete, grouping, and import validation remove links that are no longer
adjacent, same-folder, or structurally valid.

Rendering isolates the source and base, then multiplies source alpha by the
base's rendered alpha. This preserves unrelated lower artwork, source RGB
bytes, transforms, masks, adjustments, styles and editable base geometry.
Project export/import and local draft reload retain the relationship. The
bounded slice deliberately excludes multi-level clipping chains and adjustment
layers as bases.

Pure coverage includes adjacency, root/folder guards, invalid-link cleanup,
compound-base eligibility and immutable partial-alpha buffers. Browser coverage
runs the menu and touch-safe Layers-panel controls, pixels, undo/release,
reorder cleanup and project round-trip on desktop and mobile profiles.
