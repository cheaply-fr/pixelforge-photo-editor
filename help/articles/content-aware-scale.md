---
title: Resize part of an image with Content-Aware Scale
summary: Enlarge or shrink the selected part of a layer with Edit > Content-Aware Scale…, filling the area it leaves behind from the surrounding pixels.
category: transform-view
order: 80
level: advanced
keywords: [content aware scale, resize object, enlarge selection, shrink object, scale selection pixels]
related: [content-aware-fill-and-move, free-transform, selection-basics]
updated: 2026-11-14
---

**Edit > Content-Aware Scale…** scales the selected pixels of a layer and fills the area they used to cover with colour taken from around it. Use it to make an object a little bigger or smaller without leaving a hole.

![A mountain peak enlarged to 150% with Content-Aware Scale](img/content-aware-scale-result.jpg "The selected peak scaled to 150%")

## Scale a selected area

1. Select a visible, unlocked raster (pixel) layer.
2. Select the area to scale, for example with the [Elliptical Marquee](marquee-tools) or a [lasso](lasso-tools). The command is disabled without a selection.
3. Choose **Edit > Content-Aware Scale…**.
4. In the **Content-Aware Scale** dialog, set **Scale horizontally** and **Scale vertically** in percent (both start at 120). Each must be between 25% and 400%; a value outside that range is marked in red and **Scale** stays unavailable.
5. Click **Scale** or press <kbd>Enter</kbd>. The selected pixels are scaled around the centre of the selection's bounding box. **Cancel** or <kbd>Esc</kbd> leaves the layer unchanged.

The change is one undo step. It is stored with the layer rather than overwriting the original pixels, and it is included when you export.

Any part of the selection that the scaled pixels no longer cover is filled at full strength from the surrounding colours. How far the fill looks depends on the size of the selection, as for [Content-Aware Fill](content-aware-fill-and-move); brush settings such as **Size** and **Opacity** have no effect.

## Limits

- This is a simple local effect: it scales everything in the selection evenly and fills from nearby colours. It does not protect people or important objects from stretching, unlike content-aware scaling in some professional editors.
- It works on raster layers only, and a layer can hold up to 16 Content-Aware Scale operations; after that, export a copy or merge first.
- The fill copies surrounding colour; on detailed backgrounds it can look smeared. Touch up with the [healing tools](spot-healing-and-healing) or [Content-Aware Fill](content-aware-fill-and-move).
