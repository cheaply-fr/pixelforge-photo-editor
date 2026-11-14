---
title: Select a colour everywhere with Color Range and Similar
summary: Use Select > Color Range… to select every pixel close to a chosen colour, and Select > Similar to extend a selection to matching colours across the image.
category: selections
order: 70
level: intermediate
keywords: [color range, colour range, select color, select similar, fuzziness, select all of one colour]
related: [quick-selection-and-magic-wand, selection-basics, modify-selections]
updated: 2026-11-14
---

**Color Range…** and **Similar** select pixels by colour across the whole image, whether or not they are connected. Unlike Magic Wand, their edges are soft: pixels slightly further from the target colour are partly selected.

Both look at all visible layers combined and follow the **Selection mode** in Selection options (Replace, Add, Subtract or Intersect).

## Color Range

![The Color Range dialog with a warm yellow sample colour and Fuzziness 24](img/color-range-dialog.jpg "Select > Color Range…")

1. Choose **Select > Color Range…**.
2. Set **Sample colour**. It starts as your current foreground colour; click the swatch to pick another.
3. Set **Fuzziness (0–255)**: low values select only colours very close to the sample, high values reach further. It starts at your current **Color tolerance** setting (24 unless you changed it).
4. Click **Apply Color Range**.

![The lit windows of a city skyline selected with Color Range](img/color-range-result.jpg "Every lit window selected in one step")

> [!TIP]
> To sample a colour from the image, pick it with the Eyedropper first (see [Choosing colours](choosing-colors)), then open Color Range: the sample starts with that foreground colour.

## Similar

**Select > Similar** grows an existing selection to every pixel in the image with a colour like the selected area.

1. Make a selection on the colour you want, for example a small marquee on one window.
2. Set **Color tolerance** in the options of Quick Selection or Magic Wand. Similar uses it as its fuzziness.
3. Choose **Select > Similar**.

Similar averages the colours inside your selection, so a selection that mixes very different colours gives a muddy result. It needs a selection and is disabled without one.

## Limits

Both commands compare plain RGB colour. They do not understand objects or lighting, so a shadowed part of the same object may not be selected. They run locally, and the result is an ordinary editable selection that you can [modify](modify-selections), save or turn into a mask.
