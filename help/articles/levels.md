---
title: Levels
summary: Set the black point, white point and midtone gamma of a layer, and limit or invert its output range, without changing its pixels.
category: adjustments
order: 30
level: beginner
keywords: [black point, white point, gamma, midtones, contrast, tonal range, input levels, output levels]
related: [curves, adjustments-overview, auto-adjustments, histogram-and-info, adjustment-layers]
updated: 2026-11-14
---

Levels remaps the tonal range of a layer. Use it to make the darkest tones truly black, the brightest truly white, and to brighten or darken the midtones. It is one of the quickest ways to fix a flat or murky photo.

![Levels black point 35, white point 225 and gamma 1.3 give the sunset more contrast](img/levels-sliders.jpg "Levels in the Adjust selected layer panel")

## Apply Levels

1. Select the layer in the [Layers panel](layers-panel), or select an [adjustment layer](adjustment-layers) to correct everything below it.
2. Choose **Image > Levels…**. The **Adjust selected layer** panel opens at **Levels (nondestructive)**.
3. Drag **Levels black point** to the right until the darkest areas look black.
4. Drag **Levels white point** to the left until the brightest areas look white.
5. Adjust **Levels gamma**: values above 1 brighten the midtones, values below 1 darken them.

The canvas updates as you drag. Each change can be undone, and the original pixels are kept.

## Options

| Control | Range | What it does |
|---|---|---|
| Levels black point | 0–254 | Input values at or below this become black. It always stays below the white point. |
| Levels white point | 1–255 | Input values at or above this become white. It always stays above the black point. |
| Levels gamma | 0.1–3 | Bends the midtones. 1 is neutral; higher is brighter. |
| Levels output black | 0–255 | The darkest value the result may use. Raise it to fade the shadows. |
| Levels output white | 0–255 | The brightest value the result may use. Lower it to soften the highlights. |

> [!TIP]
> Set **Levels output black** higher than **Levels output white** to invert the tones. 255 and 0 give a full negative.

## Good to know

- Levels works on the red, green and blue channels together. There is no per-channel Levels; use the Red, Green and Blue editors in [Curves](curves) instead.
- Transparency is never changed.
- Levels has no built-in histogram. To see where your tones sit, open **Image > Analysis** (see [Histogram and colour readouts](histogram-and-info)).
- For a one-click stretch of the tonal range, try **Image > Auto Tone** or **Auto Contrast** ([Auto adjustments](auto-adjustments)).
