---
title: Fade an edit
summary: Weaken the last pixel edit on a raster layer with Edit > Fade…, and learn when to use a filter's Effect amount instead.
category: filters
order: 180
level: intermediate
keywords: [fade, opacity, weaken, reduce effect, last edit, ctrl shift f, strength]
related: [filters-overview, history-panel, undo-redo-and-history-basics]
updated: 2026-11-14
---

**Edit > Fade…** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>) blends the result of your last edit with how the layer looked just before it. At 100 % the edit stays as it is; at 0 % the layer goes back to its previous state; values in between give a partial edit. Use it right after a brush stroke, a fill or another change that rewrote the layer's pixels.

![The Edit menu with Fade… highlighted after a brush stroke](img/fade-menu.jpg "Edit > Fade…")

## Fade the last edit

1. Make an edit on a raster layer, for example a brush stroke.
2. Straight away, choose **Edit > Fade…**.
3. The browser asks for "Fade opacity (0–100%)", starting at 50. Type a value.
4. Click **OK**.

The status bar confirms, for example "Fade applied at 50%; undo restores the original edit". The fade is a new History step: undo it to get the full edit back, undo again to remove the edit.

## When Fade is available

Fade compares the active layer with the same layer one History step earlier. It is greyed out when:

- there is no earlier History step;
- the active layer is not a raster layer (text, shape, adjustment layers and smart objects cannot be faded);
- the layer did not exist, or was not a raster layer, in the previous step;
- Quick Mask mode is on.

If the previous and current pixels have different sizes, Fade shows an error and changes nothing.

## Fade and filters

Most filters in PixelForge are live: they are drawn on top of the layer without changing its pixels. **Fade has no visible effect after a live filter**, even though the command is available, because the layer's pixels before and after are the same. To weaken a live filter, lower its **Effect amount** in the Filters panel instead. See [Filters overview](filters-overview).

Fade does work after **Filter > Vanishing Point…**, which rewrites the layer's pixels.

> [!TIP]
> Fade blends every colour channel and transparency evenly. For a blend-mode effect, duplicate the layer before editing, edit the copy, then set the copy's blend mode and opacity in the Layers panel.
