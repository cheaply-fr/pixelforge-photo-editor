---
title: Add, duplicate and arrange layers
summary: Add new layers, duplicate, rename and delete them, and change their stacking order by dragging, with keyboard shortcuts or with Move to Position.
category: layers
order: 30
level: beginner
keywords: [new layer, copy layer, delete layer, rename layer, reorder, stacking order, bring to front, send to back, drag layers, ctrl+j]
related: [layers-panel, layer-types, find-and-select-layers, layer-groups, open-and-place-files]
updated: 2026-11-14
---

New layers keep parts of your work separate, so you can change one part without touching the rest. This article covers creating, copying, renaming, deleting and reordering layers.

## Add a layer

New layers are added directly above the selected layer, inside its folder if it is in one.

- **Paint layer:** click **Add paint layer** under the layer list, or choose **Layer > New Paint Layer**. PixelForge switches to the Brush so you can paint straight away.
- **Image layer:** click **Add image layer** and choose an image file. It is added at its original size, aligned to the top-left corner of the canvas. Use the [Move tool](move-and-align) to position it.
- **Drop files:** drag image files from your computer onto the canvas. Each file becomes a layer centred where you drop it, all in one undo step. Drop files on the layer list to insert them at a chosen position. Hold <kbd>Shift</kbd> while dropping to open the first file as a new document instead.
- **Other types:** see [Layer types](layer-types) for fill, adjustment, text, shape and smart object layers.

Files you add this way can be up to 64 MB each. Phone browsers do not support dragging files; use **Add image layer** instead. See [Open and place files](open-and-place-files) for supported formats.

## Duplicate a layer

Select one or more layers and do one of the following:

- press <kbd>Ctrl</kbd>+<kbd>J</kbd> (<kbd>⌘</kbd>+<kbd>J</kbd> on Mac);
- choose **Layer > Duplicate Layer…**;
- click **Duplicate layer** under the layer list;
- choose **Duplicate** in the row menu.

Each copy is placed directly above its original, named with "copy" added, and is unlocked. Locked layers cannot be duplicated until you unlock them.

You can also copy a layer with **Edit > Copy Layer** and add it again with **Edit > Paste Layer**.

## Rename a layer

Select the layer and type in the **Layer name** field of the Layers panel. **Layer > Rename Layer…** puts the cursor in that field. You can also choose **Rename…** in the row menu.

## Delete a layer

Select the layer, then click its trash button, click **Delete layer** under the list, choose **Layer > Delete Layer** or press <kbd>Delete</kbd> while its row has keyboard focus. If several layers are selected, they are all deleted in one step. The layer below the deleted one becomes selected.

A document always keeps at least one layer, and locked layers cannot be deleted. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to bring a deleted layer back.

## Change the stacking order

Layers higher in the list are drawn on top of layers below them.

### Drag in the list

Press on a row and drag it up or down. A line shows where the layer will land, and a hint near the pointer says "Drop above…", "Drop below…" or "Drop into folder…". Press <kbd>Esc</kbd> to cancel. On a touch screen, long-press the grip handle at the left of the row, then drag. The list scrolls when you drag near its top or bottom edge.

Dragging a selected row moves all selected layers together. Folders and [clipping groups](clipping-masks) move as one unit.

### Use commands and shortcuts

| Command | Shortcut |
|---|---|
| **Layer > Bring to Front** | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>]</kbd> |
| **Layer > Bring Forward** | <kbd>Ctrl</kbd>+<kbd>]</kbd> |
| **Layer > Send Backward** | <kbd>Ctrl</kbd>+<kbd>[</kbd> |
| **Layer > Send to Back** | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>[</kbd> |

On a Mac, use <kbd>⌘</kbd> instead of <kbd>Ctrl</kbd>. With a layer row focused, <kbd>Alt</kbd>+<kbd>↑</kbd> and <kbd>Alt</kbd>+<kbd>↓</kbd> also move it, with <kbd>Shift</kbd> to go all the way. The same commands are in the row menu, in the **Layer details** panel (under **More panels**), and as the **Raise layer** and **Lower layer** buttons under the list.

### Move to an exact position

In a tall stack, choose **Layer > Move to Position…** (or **Move to Position…** in the row menu). Type a row number in **Position**, where 1 is the top of the list, and click **Move layer**. The move is one undo step.

![The Move Layer to Position dialog with position 3 entered](img/layers-move-to-position.jpg "Move Layer to Position")

> [!NOTE]
> Locked layers, and layers in locked folders, cannot be moved. Unlock them first.
