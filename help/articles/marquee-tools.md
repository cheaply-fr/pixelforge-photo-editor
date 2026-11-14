---
title: Select rectangles and ellipses with the marquee tools
summary: Use Rectangular, Elliptical, Single Row and Single Column Marquee, with Fixed Ratio, Fixed Size and feathered edges.
category: selections
order: 20
level: beginner
keywords: [marquee, rectangle select, ellipse select, circle selection, square selection, fixed ratio, fixed size, single row, single column, feather]
tools: [select, ellipse-select, row-select, column-select]
related: [selection-basics, lasso-tools, modify-selections]
updated: 2026-11-14
---

The marquee tools select regular shapes. They share one toolbar button in the **Marquee** group. Press and hold it, or right-click it, to choose a different marquee. Press <kbd>M</kbd> to select the family, and press <kbd>M</kbd> again to step through the four tools (<kbd>Shift</kbd>+<kbd>M</kbd> steps backwards).

| Tool | What it selects |
|---|---|
| Rectangular Marquee | A rectangle |
| Elliptical Marquee | An ellipse or circle |
| Single Row Marquee | A one-pixel-high row across the whole canvas |
| Single Column Marquee | A one-pixel-wide column down the whole canvas |

## Make a marquee selection

1. Choose **Rectangular Marquee** or **Elliptical Marquee**.
2. Check **Selection mode** in the sidebar (Replace, Add, Subtract or Intersect). See [Selection basics](selection-basics).
3. Drag across the image. The selection appears with a dashed outline when you release.

For Single Row and Single Column Marquee, click where you want the row or column.

## Options

![The marquee options with Style set to Fixed Ratio 16 : 9](img/marquee-fixed-ratio-options.jpg "Marquee options: Feather, Style and the W and H fields")

| Option | What it does |
|---|---|
| Feather (new selections) | Softens the edge of the next selections you make, from 0 to 1,000 px. It does not change the current selection. Not shown for Single Row and Single Column. |
| Style | **Normal** follows your drag. **Fixed Ratio** keeps the W : H proportion you enter; the box follows the larger side of your drag. **Fixed Size** makes a selection of exactly W × H document pixels starting where you press; a single click is enough. |
| W and H | The ratio or size used by Fixed Ratio and Fixed Size. |

Style and the W and H fields are available for the Rectangular and Elliptical Marquee only. These options are saved with your editor settings in the draft, so they come back when you reopen it.

To soften a selection you have already made, use **Current selection feather** in Selection options or **Select > Feather…** (see [Modify selections](modify-selections)).

> [!NOTE]
> Holding <kbd>Shift</kbd> does not constrain the marquee to a square or circle. Use **Style: Fixed Ratio** with W and H both set to 1 instead.

> [!TIP]
> A marquee dragged entirely outside the canvas makes an empty selection; Fill and Clear then report **No pixels are selected**. Press <kbd>Ctrl</kbd>+<kbd>D</kbd> to deselect.
