---
title: Crop and straighten an image
summary: Crop with the Crop tool using free or fixed ratios, an exact output size and composition overlays, and straighten a tilted horizon in one drag.
category: transform-view
order: 30
level: beginner
featured: true
keywords: [crop, trim edges, aspect ratio, square crop, 16:9, straighten, level horizon, rule of thirds, resize crop]
tools: [crop]
related: [perspective-crop, image-and-canvas-size, rotate-and-flip, measure-count-and-notes]
updated: 2026-11-14
---

The **Crop** tool (<kbd>C</kbd>) trims the canvas to the area you choose. You see a preview first, and nothing changes until you apply it. You can also start it from **Image > Crop**.

![A crop preview with the rule-of-thirds overlay; the Apply crop bar above the canvas and Crop options in the sidebar are highlighted](img/crop-preview.jpg "Crop preview and Crop options")

## Crop an image

1. Choose **Crop**.
2. Optionally pick a **Ratio** in Crop options (see below).
3. Drag across the image. The area outside the crop is dimmed and the bar above the canvas shows **Crop preview** with the size in pixels. To change it, drag again.
4. Click **Apply crop** or press <kbd>Enter</kbd>. Click **Cancel** or press <kbd>Esc</kbd> to leave the image unchanged.

Cropping is one undo step. Notes, rulers and other annotations inside the crop move with it.

## Crop options

| Option | What it does |
|---|---|
| Ratio | **Ratio (free)**, **Original ratio**, **1 : 1 (square)**, **4 : 5 (8 : 10)**, **5 : 7**, **2 : 3 (4 : 6)**, **3 : 4**, **16 : 9**, **Custom ratio** (enter W : H) or **W × H px (resample)**. A ratio keeps your drag in that proportion, inside the canvas. |
| W × H px (resample) | Crops to the area you drag and then resizes the result to exactly the W × H pixels you enter. The output is limited to 16 megapixels. |
| Resolution (ppi, 0 keeps) | Sets the print resolution of the result. 0 keeps the current resolution. Pixels are not resampled by this setting. |
| Overlay | **Rule of thirds**, **Grid** (8 × 8) or **None**, drawn over the preview to help composition. |
| Delete Cropped Pixels | Off (default): pixels outside the crop stay on their layers, hidden, and can be moved back into view with the Move tool. On: plain image layers are trimmed to the crop. Text, shapes, smart objects and scaled or rotated layers always keep their content. |

## Straighten a tilted photo

1. Choose **Crop** and click **Straighten** in Crop options.
2. Drag along a line in the photo that should be level, such as the horizon.
3. The whole image rotates so that line is level (one undo step), and a crop preview of the largest rectangle without empty corners is shown.
4. Apply or adjust the crop as usual.

Click **Straighten** again before dragging to cancel. To level just one layer instead of the document, use **Straighten Layer** in the [Ruler](measure-count-and-notes) options.

![The Crop tool on a phone, with the crop preview bar above the image and Crop options in the properties sheet](img/crop-mobile.jpg "Cropping on a phone")

> [!TIP]
> To remove empty or single-colour borders automatically, use **Image > Trim…**. To add space around the image instead, use **Image > Canvas Size…**. See [Image and canvas size](image-and-canvas-size).
