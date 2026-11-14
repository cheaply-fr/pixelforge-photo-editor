---
title: Stroke a selection
summary: Draw an outline along the edge of a selection with Edit > Stroke Selection…, choosing width, colour, inside, centre or outside placement, blend mode and opacity.
category: selections
order: 120
level: beginner
keywords: [outline, border, edge, stroke, frame, ring, outline selection]
related: [fill-a-selection, selection-basics, modify-selections, stroke-path, layer-styles]
updated: 2026-11-14
---

**Edit > Stroke Selection…** paints a line along the edge of the current selection onto the active layer: for example a ring around a circle or a frame around a photo.

![An orange 12 px ring stroked outside an elliptical selection](img/stroke-selection-result.jpg "A 12 px Outside stroke around an elliptical selection")

## Stroke a selection

1. Make a selection. Any kind works: marquee, lasso, Magic Wand, Color Range, feathered or combined selections.
2. Select a visible, unlocked raster (pixel) layer. Tip: add a new paint layer first (**Layer > New Paint Layer**) so the stroke stays separate and easy to change.
3. Choose **Edit > Stroke Selection…**.
4. Set the options (below) and click **Stroke**.

![The Stroke Selection dialog with Width 12 px, Color, Location set to Outside, Mode and Opacity](img/stroke-selection-dialog.jpg "Edit > Stroke Selection…")

## Options

| Option | What it does | Default |
|---|---|---|
| Width (px) | Stroke thickness, 1 to 250 px in 0.5 px steps (a decimal comma is accepted). | 4 px |
| Color | The stroke colour. **Use foreground** sets it back to the foreground colour. | Foreground colour |
| Location | **Inside** draws the band just inside the edge, **Outside** just outside it, **Center** half on each side. | Center |
| Mode | A blend mode, as in the Fill dialog. | Normal |
| Opacity (%) | A whole number from 1 to 100. | 100 |

The dialog remembers your last settings until you reload the page. If a value is out of range, **Stroke** is disabled and the accepted range is shown. **Cancel** or <kbd>Esc</kbd> changes nothing.

## How the stroke follows the edge

- The stroke follows the marching ants: the line where the selection is 50% selected. A feathered selection is stroked along its visible outline, and the stroke itself has a crisp, anti-aliased edge (it is not feathered).
- Combined selections are stroked along their combined outline. Holes cut out with Subtract get their own outline.
- Curves and diagonals keep the same width as straight edges.
- Areas beyond the canvas count as unselected. **Select > All** with **Inside** draws a frame along the canvas edge; **Outside** has nothing to draw there.

The stroke is drawn over the existing pixels with the chosen mode and opacity, and is one undo step.

## Limits

The stroke becomes pixels on the layer. It is not an editable vector line or a layer style; to change it, undo and stroke again. For an editable outline that follows a layer's content, use the stroke in [Layer styles](layer-styles); for paths, see [Stroke a path](stroke-path).

**Stroke Selection…** is disabled when there is no selection or the active layer is not a visible, unlocked raster layer. A selection that covers no pixels shows **No pixels are selected**.
