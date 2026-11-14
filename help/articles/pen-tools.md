---
title: Draw paths with the Pen tools
summary: Draw straight and curved vector paths with the Pen, Freeform Pen and Curvature Pen, as filled shapes or as unfilled work paths.
category: shapes-paths
order: 30
level: intermediate
keywords: [pen tool, bezier, curve, vector, path, anchor, outline, trace, freeform, curvature pen, rubber band]
tools: [pen, freeform-pen, curvature-pen]
related: [edit-paths-and-anchors, paths-and-work-paths, stroke-path, vector-masks, text-on-path-and-warp]
updated: 2026-11-14
---

The Pen tools draw paths made of anchor points joined by straight or curved segments. Every path is its own editable layer: you can move its anchors, change its fill and outline, stroke it with a brush or use it as a mask later.

The **Pen** slot in the **Draw & Type** group of the toolbar holds the three drawing pens and the anchor tools. Press and hold (or right-click) the slot to choose one, or press <kbd>P</kbd> to cycle through **Pen**, **Freeform Pen** and **Curvature Pen** (<kbd>Shift</kbd>+<kbd>P</kbd> goes backwards).

![Three anchors of a Pen path with the Rubber Band preview of the next segment following the pointer](img/pen-path-anchors.jpg "Placing anchors with the Pen, with Rubber Band on")

## Pen

1. Choose **Pen**.
2. Click to place anchor points. Each click adds a straight segment from the previous anchor.
3. To make a curve, hold <kbd>Shift</kbd> and drag as you place an anchor: this pulls out a handle. Add <kbd>Alt</kbd> to mirror the handle to the other side of the anchor.
4. Click the first anchor (after at least three anchors) to close the path and finish it.

Press <kbd>Esc</kbd> to cancel a path you are drawing. Nothing is added to the history.

## Freeform Pen

Drag to draw freely, like a pencil. When you release, the stroke becomes an open path with smooth curves; small jitter is removed and anchors are placed for you.

## Curvature Pen

Click to place anchors. The curve through each anchor is smoothed automatically from its neighbours, so you get flowing curves without dragging handles. Click the first anchor (after three anchors) to close a smooth loop.

## Options

| Option | Tools | What it does |
|---|---|---|
| Pen mode | All three pens | **Shape (filled layer)**: the finished path is filled with the foreground colour. **Path (work path, no fill)**: the path is created as a work path with only a thin line, for use as a guide, a selection or a stroke. See [Paths and work paths](paths-and-work-paths). |
| Size | All three pens, Shape mode | Width of the outline. |
| Auto Add/Delete | Pen | When on, clicking a segment of the selected path adds an anchor and clicking an anchor deletes it. When off, every click starts a new path. |
| Rubber Band | Pen, Curvature Pen | Shows a preview of the next segment from the last anchor to the pointer. It needs a mouse or a pen that hovers; it has no effect with touch. |
| Stroke Path with Brush… | All pen and path tools | Paints along a path with a brush. See [Stroke a path](stroke-path). |

## Edit the path you are working on

With the Pen over the selected path layer:

- Click a segment to add an anchor (with **Auto Add/Delete** on).
- <kbd>Alt</kbd>+click an anchor to delete it.
- <kbd>Shift</kbd>+click an anchor to switch it between a corner and a smooth point.

For more control, use the anchor tools and Direct Selection described in [Edit paths and anchors](edit-paths-and-anchors).

## After drawing

The new path layer appears in the [Layers panel](layers-panel). Its properties include **Closed path**, **Fill** and **Stroke** check boxes, the **Path stroke width**, the **Fill color** and **Stroke color**, and the number of anchors. Untick **Closed path** to open a closed path, or tick it to close an open one.

Paths drawn with the Freeform Pen are open, so they have no fill until you close them.
