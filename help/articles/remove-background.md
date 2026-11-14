---
title: Remove a background
summary: Hide a plain backdrop in one step with Edit > Remove Background…, which masks colours connected to the edges of the image, and refine the result.
category: retouching
order: 80
level: beginner
keywords: [remove background, background remover, cut out, transparent background, isolate subject, delete background]
related: [eraser-tools, layer-masks, select-subject-and-objects, mask-brush-tools]
updated: 2026-11-14
---

**Edit > Remove Background…** hides the background of the active layer by adding a layer mask. It works on plain or simple backdrops, such as a product on a white table or a logo on a solid colour. The original pixels are kept, so you can refine or undo the result at any time.

![An orange shape and a teal bar on a transparent checkerboard after Remove Background; a small white area enclosed by the shapes is kept](img/remove-background-result.jpg "The white backdrop touching the edges is removed; the white pocket enclosed by the shapes stays")

## Remove a background

1. Select the layer in the [Layers panel](layers-panel). It must be a visible, unlocked pixel layer.
2. Choose **Edit > Remove Background…**. The command runs straight away.
3. The status bar reports the result, for example "Background removed nondestructively (79% edge pixels)", and the layer gets a mask.

## How it decides what is background

The command looks at the pixels along the four edges of the image. Areas of similar colour that touch an edge are treated as background and hidden. Anything that does not touch an edge is kept, even if it has the same colour as the background, such as the white pocket in the example above.

How similar a colour must be is set by **Color tolerance**, the same setting used by the Fill tool, Magic Wand and erasers. To change it, select one of those tools, adjust **Color tolerance** in its options, and run the command again.

## Refine the result

- The result is a normal [layer mask](layer-masks). Paint on it with the Mask Brush and Mask Eraser to fix edges (see [Mask brushes](mask-brush-tools)), or use the mask buttons in the Layers panel to disable or invert it.
- Undo (<kbd>Ctrl</kbd>+<kbd>Z</kbd>) removes the mask in one step.
- To erase manually instead, see [Eraser tools](eraser-tools).

## Limits

- It does not recognise subjects. A subject that touches an edge of the image can be removed with the background, and a busy or graded backdrop may be only partly removed.
- It works on images up to 16 megapixels.
- It runs locally in your browser and never uploads the image.

For subjects on busier backgrounds, try selecting the subject and creating a mask from the selection. See [Select subjects and objects](select-subject-and-objects).
