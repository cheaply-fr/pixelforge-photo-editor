---
title: Edit paths and anchors
summary: Move whole paths with Path Selection, drag anchors and handles with Direct Selection, and add, delete or convert anchors to reshape a path or vector mask.
category: shapes-paths
order: 40
level: intermediate
keywords: [anchor point, node, handle, bezier, reshape, path selection, direct selection, add anchor, delete anchor, convert point, corner, smooth]
tools: [path-select, direct-select, add-anchor, delete-anchor, convert-point]
related: [pen-tools, paths-and-work-paths, vector-masks, custom-shapes]
updated: 2026-11-14
---

Five tools edit existing paths. They work on the **selected layer**: its [vector mask](vector-masks) if it has one, otherwise the layer itself if it is a path layer (for example a Pen path, a custom shape or a work path). Select the layer in the [Layers panel](layers-panel) first; clicking another layer's path does not switch layers.

![A work path whose top-right corner has been turned into a smooth curve with Convert Point](img/path-convert-point.jpg "A corner converted to a smooth point by dragging out handles")

## Where to find them

| Tool | Toolbar | Key |
|---|---|---|
| Path Selection | **Path Selection** slot | <kbd>A</kbd> |
| Direct Selection | **Path Selection** slot | <kbd>A</kbd> again (<kbd>Shift</kbd>+<kbd>A</kbd> goes back) |
| Add Anchor Point | **Pen** slot | none |
| Delete Anchor Point | **Pen** slot | none |
| Convert Point | **Pen** slot | none |

Press and hold (or right-click) a slot to choose a tool from it.

## Move a whole path: Path Selection

Drag an anchor, the outline, or anywhere inside a closed path to move every anchor and handle of the path together. Releasing the mouse commits one undo step; a click without dragging changes nothing.

## Move anchors and handles: Direct Selection

Drag a single anchor or one of its handles to reshape the path. Each drag is one undo step. Direct Selection also edits the anchors of vector masks and of paths made with **Create Work Path** or **Convert to Shape**.

## Add, delete and convert anchors

- **Add Anchor Point**: click a segment to insert an anchor there. Curved segments keep their shape.
- **Delete Anchor Point**: click an anchor to remove it. A path always keeps at least one anchor, and a closed path with fewer than three anchors becomes open.
- **Convert Point**: click an anchor to switch it between a sharp corner and a smooth point. Drag from an anchor to pull out two symmetric handles. Drag one handle to move it on its own, which makes a sharp turn (a cusp).

The Pen tool can do the same edits on the selected path: click a segment to add, <kbd>Alt</kbd>+click to delete, <kbd>Shift</kbd>+click to convert. See [Draw paths with the Pen tools](pen-tools).

Press <kbd>Esc</kbd> during a drag to cancel it.

## Guards and limits

- Locked or hidden layers, and layers without a path, cannot be edited; the status bar explains why.
- Anchor editing affects the first contour of a compound path (for example the outer edge of a shape with a hole). Path Selection moves all contours together.
- One path is edited at a time. There is no marquee selection of several anchors or paths, and no <kbd>Alt</kbd>+drag duplicate.
