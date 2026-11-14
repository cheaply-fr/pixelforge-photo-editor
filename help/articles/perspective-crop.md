---
title: Correct perspective with Perspective Crop
summary: Crop a skewed surface, such as a sign, document or building front, and flatten it into a straight-on rectangle with the Perspective Crop tool.
category: transform-view
order: 40
level: intermediate
keywords: [perspective crop, keystone, straighten document, scan, skewed, flatten perspective]
tools: [perspective-crop]
related: [crop-and-straighten, perspective-and-puppet-warp, vanishing-point]
updated: 2026-11-14
---

The **Perspective Crop** tool crops to four corners you place and stretches that area into a rectangle. Use it to straighten a photo of a document, a painting on a wall or a building front taken at an angle.

It is in the Crop toolbar family: press and hold the Crop button, or right-click it, and choose **Perspective Crop**, or choose **Image > Perspective Crop…**.

![A perspective crop quadrilateral over part of a city skyline, with corner handles on the canvas and the Perspective crop panel in the sidebar](img/perspective-crop-handles.jpg "Perspective Crop with its corner fields")

## Crop with perspective

1. Choose **Perspective Crop**.
2. Mark the surface in one of two ways:
   - **Click its four corners**, in any order. The tool sorts them clockwise from the top-left.
   - **Drag a rectangle**, then move its corners.
3. Drag any corner handle on the canvas onto the matching corner of the surface. A move that would fold the shape or make it concave is ignored.
4. Fine-tune in the **Perspective crop** panel in the sidebar: **Top left X/Y**, **Top right X/Y**, **Bottom right X/Y**, **Bottom left X/Y**, plus **Output width** and **Output height**. The output size is suggested from the average lengths of opposite sides.
5. Click **Apply perspective crop** or press <kbd>Enter</kbd>. Click **Cancel** or press <kbd>Esc</kbd> to leave the image unchanged.

The result replaces the document with the corrected rectangle, as one undo step.

> [!IMPORTANT]
> Perspective Crop uses the combined visible image and produces a document with a single layer. Your separate layers are not kept (Undo brings them back). Save a project copy first if you want to keep the layered version.

## Limits

- The output is limited to 16,000 pixels on a side and 16 megapixels in total.
- Pixels are resampled with nearest-neighbour sampling, which keeps the result predictable but can look slightly jagged on strong corrections. Avoid enlarging small areas a lot.
- It flattens a single flat surface. It cannot correct lens distortion or curved surfaces; for those, see [Lens correction](lens-correction-and-adaptive-wide-angle).
