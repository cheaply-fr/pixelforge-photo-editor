---
title: Repair layer masks with Mask Brush and Mask Eraser
summary: Paint an existing layer mask directly on the canvas: Mask Brush reveals hidden pixels and Mask Eraser hides them, without touching the image itself.
category: selections
order: 130
level: intermediate
keywords: [refine mask, touch up mask, cutout cleanup, remove background fix, reveal, conceal, hide pixels]
tools: [mask-brush, mask-eraser]
related: [layer-masks, remove-background, save-and-load-selections, adjustment-brush]
updated: 2026-11-14
---

**Mask Brush** and **Mask Eraser** edit the layer mask of the active layer by painting on the image. They are made for cleaning up cut-outs, for example after [Remove Background](remove-background) or **Select > Mask from Selection**. The layer's own pixels never change, so anything you hide can be brought back.

| Tool | What painting does |
|---|---|
| Mask Brush | Reveals: makes hidden (masked) pixels visible again. |
| Mask Eraser | Conceals: hides pixels by adding them to the mask. |

Both are in the **Mask Refinement** toolbar group with the [Adjustment Brush](adjustment-brush). Press <kbd>K</kbd> repeatedly to cycle through Frame, Mask Brush, Mask Eraser and Adjustment Brush.

![A portrait cut out with an elliptical mask; a Mask Brush stroke along the bottom brings back part of the hidden image](img/mask-brush-options.jpg "Mask Brush revealing masked pixels")

## Repair a mask

1. Select a layer that has a layer mask. If it has none, create one first: make a selection and choose **Select > Mask from Selection**, or use **Edit > Remove Background…**.
2. Choose **Mask Brush** to bring pixels back, or **Mask Eraser** to hide them.
3. Set **Size**, **Hardness** and **Opacity**. A soft brush gives a gradual edge; a lower opacity reveals or hides partly.
4. Paint on the image. The change is applied when you lift the pointer, as one undo step. Press <kbd>Esc</kbd> during a stroke to cancel it.

The tools work in canvas space, so you paint exactly where you see the problem, even if the layer has been moved or scaled.

## Limits

- The active layer must be a visible, unlocked image layer with a mask. Otherwise the tool tells you to create a mask or run Remove Background first.
- Masks are limited to 16 megapixels.
- These tools paint the mask by hand; they do not detect hair or edges for you.
