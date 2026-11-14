---
title: Fade an edit
summary: Weaken the last pixel edit or the filter you just applied with Edit > Fade…, and change a filter's fade later in the Filters panel.
category: filters
order: 180
level: intermediate
keywords: [fade, opacity, weaken, reduce effect, last edit, last filter, fade filter, ctrl shift f, strength]
related: [filters-overview, history-panel, undo-redo-and-history-basics]
updated: 2026-11-14
---

**Edit > Fade…** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>) blends the result of your last edit with how the layer looked just before it. At 100 % the edit stays as it is; at 0 % the layer goes back to its previous state; values in between give a partial edit. Use it right after a brush stroke, a fill or another change that rewrote the layer's pixels, or right after you apply a filter.

![The Edit menu with Fade… highlighted after a brush stroke](img/fade-menu.jpg "Edit > Fade…")

## Fade the last edit

1. Make an edit on a raster layer, for example a brush stroke.
2. Straight away, choose **Edit > Fade…**.
3. The browser asks for "Fade opacity (0–100%)", starting at 50. Type a value.
4. Click **OK**.

The status bar confirms, for example "Fade applied at 50%; undo restores the original edit". The fade is a new History step: undo it to get the full edit back, undo again to remove the edit.

## Fade a filter

Most filters in PixelForge are live: they are drawn on top of the layer without changing its pixels (see [Filters overview](filters-overview)). Fade works with them too, and the fade stays editable.

1. Apply a filter from the **Filter** menu, or change a live filter's settings.
2. Straight away, choose **Edit > Fade…**.
3. The browser asks for the fade, for example "Fade Gaussian Blur (0–100%)", starting at 50. Type a value and click **OK**.

The status bar confirms, for example "Gaussian Blur faded to 40%; edit it under Filter effects or undo to restore". The value is stored on the filter: at 0 % the layer looks as it did before the filter, at 100 % the filter shows in full.

![The Filter effects section with the Faded to (Edit → Fade) slider at 40 percent](img/fade-live-filter.jpg "A faded Gaussian Blur in the Filters panel")

To change the fade later, open the **Filters** panel: the **Filter effects** section shows a **Faded to (Edit → Fade)** slider under **Effect amount**. Drag it to 100 % to remove the fade. The fade is one History step, so <kbd>Ctrl</kbd>+<kbd>Z</kbd> also removes it. Choosing a different filter drops the fade, and a recorded [action](actions) repeats it.

**Effect amount** and the fade both weaken a filter. Use either; the fade is handy when you want to judge the filter at full strength first and then tone it down.

## When Fade is available

Fade compares the active layer with the same layer one History step earlier. It is greyed out when:

- there is no earlier History step;
- the last step did not change the active layer's pixels or its live filter, for example straight after another Fade;
- for a pixel edit, the active layer is not a raster layer (text, shape and adjustment layers cannot be faded), or it did not exist or was not a raster layer in the previous step;
- Quick Mask mode is on.

To fade a filter, the layer must be visible and unlocked; otherwise the status bar says "Unlock and show this layer before fading its filter". If the previous and current pixels have different sizes, Fade shows an error and changes nothing.

Fade also works after **Filter > Vanishing Point…**, which rewrites the layer's pixels.

> [!TIP]
> Fade blends every colour channel and transparency evenly. For a blend-mode effect, duplicate the layer before editing, edit the copy, then set the copy's blend mode and opacity in the Layers panel.
