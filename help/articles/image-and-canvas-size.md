---
title: Change image size and canvas size
summary: Resize an image with Image Size…, add or remove space with Canvas Size…, remove empty borders with Trim… and show everything with Reveal All.
category: transform-view
order: 50
level: beginner
keywords: [resize, scale image, image size, resolution, dpi, ppi, canvas size, add border, padding, trim, reveal all, resample]
related: [crop-and-straighten, rotate-and-flip, large-documents, export-images]
updated: 2026-11-14
---

**Image Size…** scales everything in the document. **Canvas Size…** changes the area around your artwork without scaling it. **Trim…** and **Reveal All** fit the canvas to the artwork automatically. All four are in the **Image** menu, and each is one undo step.

## Image Size

![The Image Size dialog with width, height, units, resolution, Resample and Fit To options](img/image-size-dialog.jpg "Image > Image Size…")

1. Choose **Image > Image Size…** or press <kbd>Alt</kbd>+<kbd>Ctrl</kbd>+<kbd>I</kbd>.
2. Enter **Width** and **Height**. Choose a unit for each: Pixels, Inches, Centimeters or Millimeters.
3. Leave **Keep proportions** ticked to change both sides together.
4. Optionally use **Fit To** (25%, 50%, 100%, 150%, 200%) or the **50%**, **75%**, **150%** and **200%** buttons. The preview line shows the new size in pixels and megapixels.
5. Click **Apply resize**.

| Option | What it does |
|---|---|
| Resolution | Pixels/Inch or Pixels/Centimeter (1–2,400 ppi). It decides how large the image prints. |
| Resample | On: the pixel dimensions change and layers are rescaled. Off: only the print size and resolution change; the pixels stay exactly as they are. |
| Resample method | **Automatic**, **Nearest** (hard pixels, good for pixel art) or **Bilinear** (smooth). |

Layers stay editable after resizing. Documents are limited to 16,000 pixels on a side and 16 megapixels in total; see [Large documents](large-documents).

> [!TIP]
> To shrink only one layer, use [Free Transform](free-transform) instead.

## Canvas Size

![The Canvas Size dialog with width, height and anchor](img/canvas-size-dialog.jpg "Image > Canvas Size…")

1. Choose **Image > Canvas Size…**.
2. Enter the new **Width (px)** and **Height (px)**.
3. Choose an **Anchor**: where the existing artwork stays, from **Top left** to **Bottom right**. **Center** adds or removes space evenly on all sides.
4. Click **Apply canvas size**.

![A landscape image centred on a larger canvas, with transparent space around it](img/canvas-size-result.jpg "Canvas Size: new space is transparent")

New space is transparent. To give it a colour, add a layer below and fill it (see [Fill a selection](fill-a-selection)). Making the canvas smaller hides artwork outside it but does not delete it from the layers.

## Trim

**Image > Trim…** removes empty borders around the visible artwork.

1. Choose what to remove under **Trim based on**: **Transparent pixels**, or the colour of the **Top-left**, **Top-right**, **Bottom-left** or **Bottom-right pixel**.
2. Under **Trim away**, untick any side (**Top**, **Left**, **Bottom**, **Right**) you want to keep.
3. Click **Apply trim**.

Trim looks at the combined visible image, and layer pixels are kept.

## Reveal All

**Image > Reveal All** enlarges the canvas so that every layer's content, including parts moved off the edge, is visible again.
