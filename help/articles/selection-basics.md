---
title: Selection basics
summary: What a selection is, how the marching ants, selection modes, Select All, Deselect, Reselect and Inverse work, and what a selection limits.
category: selections
order: 10
level: beginner
featured: true
keywords: [select, selection, marching ants, deselect, inverse, invert, select all, add to selection, subtract, intersect]
related: [marquee-tools, lasso-tools, quick-selection-and-magic-wand, modify-selections, fill-a-selection]
updated: 2026-11-14
---

A selection marks the part of the image you want to work on. While a selection is active, painting, filling, clearing, filters and many other edits change only the selected pixels and leave the rest alone. Selections never change pixels by themselves.

![An elliptical selection around a mountain peak, with the Selection options highlighted in the sidebar](img/selection-marching-ants.jpg "An active selection and its options")

## The selection outline

Every selection is shown with an animated dashed outline, often called "marching ants". It is drawn wherever the selection crosses 50% coverage, so a soft (feathered) selection shows its outline in the middle of its soft edge. Separate islands and holes each get their own outline. If your system asks for reduced motion, the dashes stay still.

A selection can be partly selected: pixels at a feathered edge, or picked by colour tools such as [Color Range](color-range-and-similar), can be selected at, say, 40%. Edits then apply at that strength.

## Ways to make a selection

| Tool or command | Best for |
|---|---|
| [Marquee tools](marquee-tools) (<kbd>M</kbd>) | Rectangles, ellipses, single rows or columns |
| [Lasso tools](lasso-tools) (<kbd>L</kbd>) | Freehand, straight-edged or edge-following shapes |
| [Quick Selection and Magic Wand](quick-selection-and-magic-wand) (<kbd>W</kbd>) | Areas of similar colour |
| [Selection Brush](selection-brush) | Painting a selection by hand |
| [Select > Subject, Sky, Object Selection… and Focus Area…](select-subject-and-objects) | A quick automatic starting point |
| [Select > Color Range… and Similar](color-range-and-similar) | Every pixel of a colour, anywhere in the image |
| [Quick Mask](select-and-mask) (<kbd>Q</kbd>) | Painting a selection as a red overlay |

## Selection mode: add, subtract and intersect

The selection tools and commands share one **Selection mode**, in **Selection options** in the properties sidebar:

| Mode | Result |
|---|---|
| Replace | The new selection replaces the current one. |
| Add | The new selection is added to the current one. |
| Subtract | The new selection is removed from the current one. |
| Intersect | Only the area covered by both is kept. |

The mode stays set until you change it, and it also applies to Quick Selection, Magic Wand, Color Range, Similar, Subject, Sky, Object Selection and Focus Area.

> [!NOTE]
> Unlike some other editors, holding <kbd>Shift</kbd> or <kbd>Alt</kbd> while dragging does not switch the mode. Choose it in **Selection mode** instead.

## Everyday commands

| Command | Shortcut | What it does |
|---|---|---|
| **Select > All** | <kbd>Ctrl</kbd>+<kbd>A</kbd> | Selects the whole canvas. |
| **Select > Deselect** | <kbd>Ctrl</kbd>+<kbd>D</kbd> | Removes the selection. |
| **Select > Reselect** | | Brings back the last selection after you deselected it. |
| **Select > Inverse** | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> | Swaps selected and unselected areas. |
| **Edit > Clear** | <kbd>Delete</kbd> or <kbd>Backspace</kbd> | Makes the selected pixels of the active raster layer transparent. The selection stays. |

The **Invert selection** and **Clear selection** buttons in Selection options do the same as Inverse and Deselect. **Clear selection** removes the selection only; it does not erase pixels.

When a selection exists, Selection options also shows **Current selection feather**, a slider from 0 to 100 px that softens the edge of the current selection. See [Modify selections](modify-selections) for larger values.

## What a selection limits

- Painting, erasing and retouching tools paint only inside the selection.
- [Edit > Fill…](fill-a-selection), [Edit > Stroke Selection…](stroke-a-selection) and Clear use the selection.
- **Select > Mask from Selection** turns the selection into a layer mask. See [Save and load selections](save-and-load-selections).

If a selection ends up covering no pixels, for example a lasso drawn completely outside the canvas, it still counts as a selection. Fill, Clear and Stroke then change nothing and show **No pixels are selected**. Press <kbd>Ctrl</kbd>+<kbd>D</kbd> to deselect.

> [!TIP]
> Selections are part of your document: they are kept in undo history, in your local draft and in project files. Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to step back to a previous selection.
