---
title: Paint a selection with the Selection Brush
summary: Paint a selection by hand with the Selection Brush, using size, hardness, opacity and pen pressure, and add to or subtract from it.
category: selections
order: 50
level: beginner
keywords: [paint selection, brush selection, refine selection, touch up selection, soft selection]
tools: [selection-brush]
related: [selection-basics, select-and-mask, lasso-tools, quick-selection-and-magic-wand]
updated: 2026-11-14
---

The Selection Brush lets you paint a selection directly, the way you would paint with a brush. It is handy for organic shapes and for touching up a selection made with another tool. The image pixels never change; only the selection does.

The Selection Brush has its own button in the **Selection** group of the toolbar. Press <kbd>L</kbd> or <kbd>W</kbd> repeatedly to reach it from the lasso or wand families.

![A Selection Brush stroke across a portrait, with Size, Hardness, Opacity and pressure options in the sidebar](img/selection-brush-painted.jpg "Selection Brush and its options")

## Paint a selection

1. Choose **Selection Brush**.
2. Set **Selection mode** in Selection options:
   - **Replace** starts a new selection with each stroke.
   - **Add** paints more selection.
   - **Subtract** paints selection away.
   - **Intersect** keeps only the part of the existing selection under the stroke.
3. Adjust **Size** (or press <kbd>[</kbd> and <kbd>]</kbd>), **Hardness** and **Opacity**.
4. Paint on the image. The selection updates when you lift the pointer. Press <kbd>Esc</kbd> during a stroke to cancel it.

Each stroke is one undo step.

## Options

| Option | What it does |
|---|---|
| Size | Brush diameter in pixels. |
| Hardness | 100% gives a crisp edge; lower values give a soft, partly selected edge. |
| Opacity | How strongly the stroke selects. At 50%, painted pixels are half selected. |
| Pressure affects size / Pressure affects opacity | Off by default. When on, pen or touch pressure varies the size or opacity. A mouse always paints at full pressure. |

> [!TIP]
> For larger repairs, [Quick Mask](select-and-mask) shows the selection as a red overlay so you can see exactly which areas are selected while you paint.
