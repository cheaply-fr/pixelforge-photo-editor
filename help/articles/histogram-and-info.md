---
title: Histogram and colour readouts
summary: Check the tonal range of your image with Image > Analysis, and read exact colour values with the Color Sampler tool.
category: adjustments
order: 100
level: intermediate
keywords: [histogram, analysis, info panel, colour values, color values, rgb values, sampler, mean, tonal range, clipping]
related: [levels, curves, auto-adjustments, measure-count-and-notes, choosing-colors]
updated: 2026-11-14
---

Before and while you adjust an image, it helps to know where its tones sit and what the exact colour values are. PixelForge has a **Histogram** for the whole image and the **Color Sampler** tool for exact values at chosen points. There is no separate Info panel; the Color Sampler list does that job.

## View the histogram

1. Choose **Image > Analysis**. The **Histogram** dialog opens.
2. Pick a **Channel**: **Luminance**, **Red**, **Green** or **Blue**.
3. Click **Close** or press <kbd>Esc</kbd> when you are done.

![The Histogram dialog for the landscape sample](img/histogram-dialog.jpg "Image > Analysis")

The graph has 256 bars, from black on the left to white on the right. A tall bar means many pixels have that value. Bars bunched in the middle with gaps at both ends mean a flat image that [Levels](levels) or [Auto Tone](auto-adjustments) can stretch. A tall bar at either end means detail is clipped to pure black or white.

| Value | Meaning |
|---|---|
| Visible pixels | Pixels that are not fully transparent. Fully transparent pixels are left out of the graph. |
| Mean luminance | Average brightness, from 0 (black) to 255 (white). |
| Range | The darkest and brightest luminance values present (whatever channel is shown). |
| Alpha total | The sum of the alpha (opacity) values of all visible pixels. |

The histogram describes the image as it currently looks, with all layers and adjustments applied. It is a snapshot: close it and choose **Image > Analysis** again after you make changes. Opening it never changes the document or adds a history step.

## Read exact colours with the Color Sampler

1. Click **Color Sampler** in the **Measure** group of the toolbar, or press <kbd>I</kbd> repeatedly until it is selected.
2. Click the image where you want to measure. A marker is placed, and a row appears in the tool options.
3. Click more points to compare areas.

![Three color samplers on the image and their values in the tool options](img/color-sampler-readout.jpg "Color Sampler readouts")

Each row shows the sampler number, its **R**, **G** and **B** values, the hex colour and the alpha (α). The values follow your edits: adjust a layer and the readouts update to the new result, which makes the samplers useful for checking that a grey stays neutral or a skin tone stays in range.

- Delete one sampler with its bin button, or all of them with **Clear All**.
- Samplers are saved with the document but never appear in exported images.

To pick a colour for painting instead, use the Eyedropper ([Choosing colours](choosing-colors)). The other measuring tools are covered in [Measure, count and notes](measure-count-and-notes).
