---
title: Vector masks
summary: Hide parts of a layer with an editable path instead of painted pixels, reshape it with Direct Selection, and invert, disable or remove it.
category: shapes-paths
order: 70
level: intermediate
keywords: [vector mask, path mask, clip, crop to shape, hide, non-destructive, cut out]
related: [layer-masks, edit-paths-and-anchors, pen-tools, clipping-masks]
updated: 2026-11-14
---

A vector mask hides the parts of a layer outside a path. Unlike a painted [layer mask](layer-masks), its edge is a path you can reshape at any time, and it stays crisp at any size. The layer's own pixels are never changed.

![A landscape layer with a vector mask whose top-left corner was dragged inwards, hiding a triangle of the image; the vector mask buttons are shown in the Layers panel](img/vector-mask.jpg "A vector mask reshaped with Direct Selection")

## Add a vector mask

1. Select the layer in the [Layers panel](layers-panel). Pixel layers, smart objects, type, shapes and paths can have a vector mask; adjustment layers cannot.
2. Choose **Layer > Create Vector Mask**, or click **Create vector mask** in the Layers panel.

The new mask is a rectangle around the whole layer, so nothing is hidden yet.

## Shape the mask

Choose **Direct Selection** (press <kbd>A</kbd> twice) and drag the mask's anchors and handles. While the layer has a vector mask, all the path tools edit the mask rather than the layer:

- **Add Anchor Point**, **Delete Anchor Point** and **Convert Point** add corners or curves to the mask.
- **Path Selection** moves the whole mask outline.

See [Edit paths and anchors](edit-paths-and-anchors). Each change is one undoable step.

Only closed areas count: the mask shows what is inside its closed contours, and any outline (stroke) setting of the path is ignored.

## Invert, disable or remove

| Command (Layer menu) | Layers panel button | Effect |
|---|---|---|
| Invert Vector Mask | Invert vector mask | Hide the inside of the path instead of the outside. |
| Disable Vector Mask | Disable vector mask / Enable vector mask | Turn the mask off temporarily. The path is kept. |
| Remove Vector Mask | Remove vector mask | Delete the mask and show the whole layer again. |

These commands are unavailable on locked or hidden layers.

A vector mask also works on a layer inside a [clipping mask](clipping-masks).

> [!NOTE]
> Vector masks are kept in drafts and [project files](project-files). Exported images contain the masked result as pixels.
