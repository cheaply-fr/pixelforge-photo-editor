# Clipping mask contract

PixelForge stores a clipping relationship on the active raster or embedded
smart-object layer with `clippingTo`, pointing to the directly lower
pixel-producing layer in the same root or folder. The base may be raster,
smart-object, editable text, a parametric shape, a line, or a path. A path's
rendered alpha includes compound contours and even-odd holes.

Create and Release Clipping Mask are available from the Layer menu and Layers
panel. The source and base must be visible and unlocked. Each accepted action
creates one history entry; Undo and Redo restore the relationship. Delete,
grouping, and import validation remove links that are no longer adjacent,
same-folder, or structurally valid.

Consecutive clipped layers form one clipping group. Each stored link still
names the adjacent lower layer, but rendering follows the links down to the
group's base: every clipped layer in the group uses the base's alpha, not the
alpha of the clipped layer directly below it, and the Layers panel reports
"Clipped to <base>". Documents saved with such chains load unchanged.

Bring Forward, Send Backward, Bring to Front, Send to Back and the panel's
Raise/Lower keep a clipped layer clipped while it still sits directly above
its group's base or another layer of the same group (the adjacent link is
re-pointed). A clipped layer moved out of its group is released and the
status names it; Undo restores it.

New layers (Add paint layer, fill, adjustment, text, shape and path layers,
paste and placed images) are inserted directly above the active layer
(`src/layerInsertion.ts`), inside its folder unless the folder is locked (then
directly above the folder). When the active layer is clipped, or is a base or
member whose group continues above it, the new layer joins that clipping group:
it clips to the active layer and the clipped layer above is re-pointed to it,
so the group keeps the same base ("Layer added to the clipping group"). Undo
removes the layer and restores the previous links. Paste of a copied folder
member keeps its explicit folder placement.

Rendering isolates the source and base, then multiplies source alpha by the
base's rendered alpha. This preserves unrelated lower artwork, source RGB
bytes, transforms, masks, adjustments, styles and editable base geometry.
Project export/import and local draft reload retain the relationship. The
bounded slice excludes adjustment layers as bases.

Pure coverage includes adjacency, root/folder guards, invalid-link cleanup,
compound-base eligibility and immutable partial-alpha buffers. Browser coverage
runs the menu and touch-safe Layers-panel controls, pixels, undo/release,
reorder cleanup and project round-trip on desktop and mobile profiles.
