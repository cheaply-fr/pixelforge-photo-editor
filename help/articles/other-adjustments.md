---
title: Exposure, vibrance and other adjustments
summary: Use Exposure, Vibrance, Black and White, Blur and Sharpen and Noise in the Adjust selected layer panel.
category: adjustments
order: 60
level: beginner
keywords: [exposure, vibrance, black and white, monochrome, greyscale, grayscale, blur, sharpen, noise, grain, brightness, contrast]
related: [adjustments-overview, hue-saturation-and-color-balance, levels, sharpen-filters, noise-filters, camera-raw-filter]
updated: 2026-11-14
---

Besides Levels, Curves, Hue/Saturation and Color Balance, the **Adjust selected layer** panel has a few more quick corrections. Like every adjustment they are stored with the layer and can be changed or reset later. Open the panel from **More panels > Adjust** in the properties sidebar.

![Black and White and +0.6 EV exposure applied to the landscape](img/photo-finishing-black-and-white.jpg "Photo finishing: Exposure and Black and White")

## Photo finishing

| Control | Range | What it does |
|---|---|---|
| Exposure | −5 to +5 EV | Brightens or darkens as if the camera had let in more or less light. Each 1 EV doubles or halves the brightness, so bright areas clip quickly at high values. |
| Vibrance | −100 to 100 | Raises saturation mostly in muted colours, leaving already vivid colours largely alone. Negative values fade colour evenly; −100 is fully grey. |
| Black and White | on/off | Converts the layer to greys based on each colour's brightness. |

> [!NOTE]
> The Photo finishing controls are hidden while the Dodge, Burn or Sponge tool is active. Switch to another tool to see them.

## Brightness, Contrast and Blur

The first sliders in the panel are simple whole-layer controls:

| Control | Range | What it does |
|---|---|---|
| Brightness | 20–180% | Lightens or darkens everything. 100% is unchanged. |
| Contrast | 20–180% | Spreads or compresses the tones. 100% is unchanged. |
| Blur | 0–12 px | Softens the whole layer. For more blur types, use the [blur filters](blur-filters). |

Saturation and Hue are described in [Hue/Saturation and Color Balance](hue-saturation-and-color-balance).

## Sharpen and Noise

Choose **Image > Adjustments** and pick **Sharpen and Noise…**, or scroll to **Sharpen and Noise** in the panel.

| Control | Range | What it does |
|---|---|---|
| Sharpen amount | 0–100 | Strength of the sharpening. 0 is off. |
| Sharpen radius | 0–8 px | How wide the edges are that get sharpened. |
| Sharpen threshold | 0–255 | Skips small differences, so flat areas such as skin or sky are not sharpened. |
| Noise amount | 0–100 | Adds grain. 0 is off. |
| Noise seed | 0–10000 | Changes the random pattern of the grain. The same seed always gives the same grain. |
| Monochromatic noise | on/off | Uses grey grain instead of coloured grain. |

> [!TIP]
> For more sharpening and noise options, such as Unsharp Mask or Reduce Noise, see [Sharpen filters](sharpen-filters) and [Noise filters](noise-filters). For highlights, shadows, temperature and tint controls, see [Camera Raw Filter](camera-raw-filter).
