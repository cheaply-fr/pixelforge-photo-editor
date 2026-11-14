---
title: Draw selections with the lasso tools
summary: Draw freehand selections with Lasso, straight-edged ones with Polygonal Lasso, and edge-following ones with Magnetic Lasso.
category: selections
order: 30
level: beginner
keywords: [lasso, freehand selection, polygon selection, magnetic lasso, trace edge, outline selection]
tools: [lasso, polygonal-lasso, magnetic-lasso]
related: [selection-basics, marquee-tools, selection-brush, modify-selections]
updated: 2026-11-14
---

The lasso tools select irregular shapes. They share one toolbar button in the **Lasso** group; press and hold it, or right-click it, to choose **Freeform Lasso**, **Polygonal Lasso** or **Magnetic Lasso**. Press <kbd>L</kbd> repeatedly to step through the Lasso tools and the [Selection Brush](selection-brush).

![A polygonal lasso selection around a group of trees and mountains](img/polygonal-lasso-selection.jpg "A Polygonal Lasso selection")

## Lasso (freehand)

1. Choose **Lasso**.
2. Drag around the area you want. Release to close the shape; the start and end points are joined with a straight line.

## Polygonal Lasso

1. Choose **Polygonal Lasso**.
2. Click to place each corner. A dashed line shows the path so far.
3. Close the shape by clicking the first point again (after at least three points), or double-click the last point.

Press <kbd>Esc</kbd> to cancel a path you have not closed yet. This click-by-click method also works with touch and a pen.

## Magnetic Lasso

Magnetic Lasso snaps the outline to the strongest nearby edge in brightness as you move.

1. Select the layer whose edges you want to follow. Magnetic Lasso reads the active visible raster layer.
2. Choose **Magnetic Lasso**.
3. Press on an edge and drag along it. The path snaps to nearby contrast.
4. Release to close the selection. Press <kbd>Esc</kbd> while dragging to cancel.

Magnetic Lasso works best where the object and background differ clearly in brightness. On soft, low-contrast or busy edges it can wander; tidy up with the [Selection Brush](selection-brush) or [Quick Mask](select-and-mask). It looks only at brightness edges in your image, on your device; it does not recognise objects.

## Options

All three lassos have **Feather (new selections)**, which softens the edge of the next selection from 0 to 1,000 px, and **Selection mode** (Replace, Add, Subtract or Intersect). See [Selection basics](selection-basics).

> [!TIP]
> Parts of a lasso path outside the canvas are clipped to the canvas edge, so you can draw past the edge to select right up to it.
