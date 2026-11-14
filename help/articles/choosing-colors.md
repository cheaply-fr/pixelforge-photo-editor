---
title: Choose colours and use the Eyedropper
summary: Set the foreground and background colours, swap or reset them, and pick colours from the image with the Eyedropper tool.
category: painting
order: 5
level: beginner
keywords: [colour picker, color picker, foreground colour, background colour, eyedropper, pick colour, sample colour, swap colours, hex]
tools: [eyedropper]
related: [brush-tool, paint-bucket, gradient-tool, measure-count-and-notes]
updated: 2026-11-14
---

PixelForge uses two colours for painting: the foreground colour, which the Brush, Pencil, Fill and most other tools paint with, and the background colour, used by gradients, pattern tiles and the Eraser on a Background layer.

![The Eyedropper options with Sample size set to 5 by 5 Average, and the Color and Background wells highlighted at the bottom of the toolbar](img/color-wells.jpg "The Color and Background wells, and the Eyedropper options")

## Set the colours

The two colour wells sit at the bottom of the toolbar:

- **Color** is the foreground colour.
- **Background** is the background colour.

Click a well to open your browser's colour picker, then choose a colour or type a hex value. The picker's look depends on your browser and operating system.

| Shortcut | What it does |
|---|---|
| <kbd>X</kbd> | Swap the foreground and background colours. |
| <kbd>D</kbd> | Reset to a black foreground and a white background. |

## Pick a colour from the image

1. Choose the **Eyedropper** in the **Measure** group of the toolbar, or press <kbd>I</kbd>.
2. Click the canvas to set the foreground colour.
3. <kbd>Alt</kbd>+click to set the background colour instead.

The status bar confirms the sampled colour, for example "Color sampled from image (5 × 5 average)".

### Eyedropper options

| Option | What it does |
|---|---|
| Sample size | **Point Sample** reads one pixel. **3 by 3 Average** up to **101 by 101 Average** average a square of pixels around the click, which avoids picking up noise or a single odd pixel. |
| Sample | **All Layers** reads the visible image. **Current Layer** reads only the active layer, ignoring layers above and below. |

Clicking a transparent spot picks nothing and shows "No visible pixel to sample".

> [!TIP]
> To keep an eye on colour values at fixed points while you edit, use the **Color Sampler** tool in the same toolbar group. See [Measure, count and notes](measure-count-and-notes).

## Colours in other tools

- The [Gradient tool](gradient-tool) goes from the foreground colour to transparency or to the background colour.
- The [Pattern Stamp](clone-and-pattern-stamp) and pattern fills draw their built-in patterns in the foreground colour over the background colour.
- [Color Replace](color-replacement-tool) with **Background Swatch** sampling replaces colours that match the background colour.
- The Brush and Pencil can vary each dab's colour with [colour dynamics](brush-settings-and-dynamics).
