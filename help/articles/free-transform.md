---
title: Scale, rotate and skew a layer with Free Transform
summary: Move, scale, rotate, skew or flip the active layer with exact numbers using Edit > Free Transform, and use the quick Transform rotate and flip commands.
category: transform-view
order: 20
level: beginner
keywords: [transform, scale layer, resize layer, rotate layer, skew, flip layer, ctrl t]
related: [move-and-align, rotate-and-flip, perspective-and-puppet-warp, modify-selections]
updated: 2026-11-14
---

**Edit > Free Transform** (<kbd>Ctrl</kbd>+<kbd>T</kbd>) changes the position, size, angle and slant of the active layer. You type exact values in a dialog; the change is applied around the centre of the layer's visible content.

![The Free Transform dialog with fields for offset, scale, rotation, skew and flip](img/free-transform-dialog.jpg "Edit > Free Transform")

## Transform a layer

1. Select the layer. It must be unlocked.
2. Choose **Edit > Free Transform** or press <kbd>Ctrl</kbd>+<kbd>T</kbd>.
3. Enter the values you need:

| Field | Range |
|---|---|
| Horizontal offset (px), Vertical offset (px) | −16,000 to 16,000 |
| Width scale (%), Height scale (%) | 1 to 1,000 |
| Rotation (degrees) | −180 to 180 |
| Horizontal skew (degrees), Vertical skew (degrees) | −80 to 80 |
| Flip horizontally, Flip vertically | On or off |

4. Click **Apply free transform**.

Free Transform is non-destructive: the layer keeps its original pixels and stores the transform, so you can transform again later without losing quality from repeated resampling. Masks stay editable, and the change is one undo step.

> [!NOTE]
> There are no drag handles on the canvas; Free Transform works through the dialog. To move a layer by dragging, use the [Move tool](move-and-align).

## Quick rotate and flip

The **Edit** menu also has one-click transforms for the active layer:

- **Transform → Rotate 90° Clockwise**
- **Transform → Rotate 90° Counterclockwise**
- **Transform → Rotate 180°**
- **Transform → Flip Horizontal**
- **Transform → Flip Vertical**

To rotate or flip the whole document instead, see [Rotate and flip](rotate-and-flip).

## Related transforms

- [Transform Selection](modify-selections) changes the selection outline, not pixels.
- [Perspective Warp and Puppet Warp](perspective-and-puppet-warp) bend a layer's pixels.
- [Content-Aware Scale](content-aware-scale) scales part of a layer.
