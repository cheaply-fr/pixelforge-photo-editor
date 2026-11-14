---
title: Grow, shrink, border, smooth, feather and transform a selection
summary: Refine an existing selection with Select > Grow…, Contract…, Border…, Smooth…, Feather… and Transform Selection, without changing any pixels.
category: selections
order: 80
level: intermediate
keywords: [expand selection, contract selection, shrink selection, border, smooth selection, feather, soft edge, transform selection, scale selection, rotate selection]
related: [selection-basics, select-and-mask, stroke-a-selection, marquee-tools]
updated: 2026-11-14
---

The commands in the lower part of the **Select** menu change the shape or edge of the current selection. They never change image pixels, and each one is a single undo step. They need an active selection; without one they tell you to create a selection first.

## Grow, Contract, Border and Smooth

![A ring-shaped selection made with Border from an elliptical selection](img/border-selection-result.jpg "Select > Border… turns an ellipse into a 20 px ring")

1. Make a selection.
2. Choose one of the commands below.
3. Enter **Radius (px)**, a whole number from 1 to 1,000.
4. Click **Apply selection refinement**.

| Command | What it does |
|---|---|
| **Select > Grow…** | Expands the selection outwards by the radius. |
| **Select > Contract…** | Shrinks the selection inwards by the radius. |
| **Select > Border…** | Replaces the selection with a band along its edge, extending the radius both inside and outside. |
| **Select > Smooth…** | Softens jagged or noisy edges by averaging the selection over the radius. |

Grow, Contract and Border use a square neighbourhood, so on rounded selections a large radius can give slightly squared corners. Partly selected pixels keep their partial strength.

> [!NOTE]
> Grow is not a colour-based command here: it expands the selection's shape. To extend a selection to similar colours, use [Select > Similar](color-range-and-similar).

## Feather

Feathering softens the edge so that edits fade out gradually.

1. Choose **Select > Feather…**.
2. Enter **Feather (px)**, from 0 to 1,000. Decimals such as 1.5 are allowed (a comma also works).
3. Click **Apply feather**.

You can also drag **Current selection feather** (0–100 px) in Selection options. A feather affects how the selection is used (fills, painting, masks, clearing); the marching ants stay on the 50% line of the soft edge.

## Transform Selection

![The Transform Selection dialog with offset, scale, rotation, skew and flip fields](img/transform-selection-dialog.jpg "Select > Transform Selection")

**Select > Transform Selection** moves or reshapes the selection outline itself, around its centre. Enter any of:

| Field | Range |
|---|---|
| Horizontal offset (px), Vertical offset (px) | −16,000 to 16,000 |
| Width scale (%), Height scale (%) | 1 to 1,000 |
| Rotation (degrees) | −180 to 180 |
| Horizontal skew (degrees), Vertical skew (degrees) | −80 to 80 |
| Flip horizontally, Flip vertically | On or off |

Click **Apply selection transform**. Parts that move off the canvas are clipped at its edge. To transform the pixels of a layer instead, use [Free Transform](free-transform).

> [!TIP]
> For a smoother edge in one step, [Select and Mask…](select-and-mask) combines edge smoothing and feathering.
