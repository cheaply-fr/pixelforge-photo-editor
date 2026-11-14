---
title: Warp text and put text on a path
summary: Bend type into an arc, bulge or flag with Warp Text, or run it along a curve drawn with the Pen tools, while keeping it editable.
category: type
order: 60
level: intermediate
keywords: [curved text, arc text, bend text, text on a curve, circle text, warp, distort text, type on path]
related: [add-text, pen-tools, paths-and-work-paths]
updated: 2026-11-14
---

Both commands keep the text editable: you can still retype it, change the font or move it, and the warp or path follows.

## Warp text

![The words "Golden hour" bent into an arc over a sunset photo](img/type-warp-arc.jpg "Arc warp with a bend of 60")

1. Select a type layer.
2. Choose **Type > Warp Text…**, or click **Warp** in the Type options bar.
3. Answer the three prompts:
   - **Warp style**: `none`, `arc`, `bulge` or `flag`.
   - **Bend**: from −100 to 100. Negative values bend the other way.
   - **Vertical distortion**: from −100 to 100.

The warp is one undoable step. To remove it, run **Warp Text…** again and enter `none`.

> [!NOTE]
> Warp moves and rotates each character; the letter shapes themselves are not distorted. An unknown style name is treated as `none`.

## Put text on a path

![The words "Follow the curve of the hills" running along a curved path over a landscape](img/type-on-path.jpg "Text placed on a curved work path")

1. Draw the path with the [Pen tools](pen-tools), for example a curve with the **Freeform Pen**. Set **Pen mode** to **Path (work path, no fill)** if you only want the path as a guide.
2. Add the text with the **Horizontal Type** tool and make sure the type layer is selected.
3. Choose **Type > Text on Path…**. The command is available when the document has at least one path layer.
4. Answer the prompts:
   - **Path layer ID**: the prompt lists each path layer's ID and name, and suggests the first path. Press <kbd>Enter</kbd> to accept it, or type the ID of another path from the list.
   - **Path offset in pixels**: how far along the path the text starts.
   - **Reverse text direction along the path?**: choose OK to run the text the other way.

The text follows the path's first contour. If you edit or move the path afterwards, the text moves with it.

Limits:

- Text on a path is horizontal type on one line; line breaks are ignored.
- Text that is longer than the path is cut off at the end.
- Only the layer's base style is used; per-character styling is not shown along the path.

> [!TIP]
> The path layer is drawn like any other layer: a work path shows as a thin line in the foreground colour. Turn off the path layer's visibility in the [Layers panel](layers-panel) to hide the line; the text keeps following the hidden path.
