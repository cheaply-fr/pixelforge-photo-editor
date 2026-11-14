---
title: Select by colour with Quick Selection and Magic Wand
summary: Brush over an area with Quick Selection, or click once with Magic Wand, to select connected pixels of similar colour.
category: selections
order: 40
level: beginner
keywords: [magic wand, quick select, wand, tolerance, contiguous, sample all layers, select colour, select background]
tools: [quick-selection, magic-wand]
related: [selection-basics, color-range-and-similar, select-subject-and-objects, selection-brush]
updated: 2026-11-14
---

Quick Selection and Magic Wand select pixels whose colour is close to the colour you click or brush over. They share a toolbar button in the **Selection** group; press and hold it, or right-click it, to switch. Press <kbd>W</kbd> repeatedly to step through Selection Brush, Quick Selection and Magic Wand.

Both tools compare colours only. They do not recognise objects, so they work best on areas with clear colour edges.

## Magic Wand

![Magic Wand selecting the dark mountain ridge, with Color tolerance, Contiguous and Sample All Layers in the sidebar](img/magic-wand-ridge.jpg "Magic Wand with Contiguous on")

1. Choose **Magic Wand**.
2. Set **Color tolerance** and the other options (below).
3. Click the colour you want to select.

| Option | What it does |
|---|---|
| Color tolerance | How far (0–255 per channel) a pixel's colour may differ from the clicked pixel and still be selected. Default 24. This setting is shared with Quick Selection, Fill, Color Replace and the erasers. |
| Contiguous | On (default): select only matching pixels connected to the click. Off: select every matching pixel in the image. |
| Sample All Layers | Off (default): look at the active layer only. On: look at all visible layers combined. |

Magic Wand edges are hard pixel edges, with no anti-aliasing. To soften them, use **Current selection feather** or **Select > Feather…** (see [Modify selections](modify-selections)).

## Quick Selection

![Quick Selection stroke selecting the dark ridge behind the lake](img/quick-selection-stroke.jpg "A Quick Selection stroke grows into the matching colour")

1. Choose **Quick Selection**.
2. Set **Size** and **Color tolerance**.
3. Paint over the area you want. The selection grows from the pixels under your stroke into connected pixels of similar colour, and stops at strong colour edges.
4. To extend or trim the result, set **Selection mode** to Add or Subtract and paint again.

Quick Selection looks at all visible layers combined. Its **Opacity** sets how strongly the grown area is selected; leave it at 100% for a full selection. Press <kbd>Esc</kbd> during a stroke to cancel it. Quick Selection works with a mouse, a pen or touch.

> [!NOTE]
> Each connected region Quick Selection grows is limited to about 2 million pixels, and transparent pixels are skipped. On very large or very textured images, add to the selection with more strokes, or switch to [Selection Brush](selection-brush) or [Color Range](color-range-and-similar).

## Which one to use

- **Magic Wand** for flat colour areas: a plain sky, a studio backdrop, a logo.
- **Quick Selection** when you want to steer the result with a few brush strokes.
- [Color Range](color-range-and-similar) when the colour appears in many places and you want a soft-edged result.
