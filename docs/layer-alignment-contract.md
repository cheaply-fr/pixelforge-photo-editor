# Layer alignment and distribution contract

PixelForge keeps editable source assets and affine transforms separate. The
alignment commands therefore move only the translation components of a layer's
matrix. Rotation, scale, masks, adjustments, vector parameters, text metadata
and raster source assets remain unchanged.

## Canvas alignment

`Layer → Align Left`, `Align Horizontal Centers`, `Align Right`, `Align Top`,
`Align Vertical Centers` and `Align Bottom` use the transformed painted bounds
of the active unlocked layer. Bounds include the layer's local geometry and a
bounded blur tail. The resulting delta places the corresponding edge or
center on the document canvas; negative and oversized bounds are valid. A
no-op alignment does not create a history entry.

## Folder distribution

`Distribute horizontally` and `Distribute vertically` operate on the active
layer's folder. Only visible, unlocked children participate. Children are
ordered by their current painted center, with the stable layer id breaking
ties. The first and last children stay fixed; interior centers receive equal
spacing. Folders with fewer than three eligible children are rejected. The
operation changes only translation and is one undoable commit.

These commands do not yet claim Photoshop's multi-selection model, nested
folders or edge-based distribution. Isolated group blending is covered by the
separate [`group-compositing-contract.md`](./group-compositing-contract.md).
