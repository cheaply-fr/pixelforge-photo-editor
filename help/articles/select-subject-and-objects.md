---
title: Quick starting selections with Subject, Sky, Object Selection and Focus Area
summary: Make a fast automatic starting selection with Select > Subject, Sky, Object Selection… and Focus Area…, and learn what these local approximations can and cannot do.
category: selections
order: 60
level: intermediate
keywords: [select subject, select sky, object selection, focus area, automatic selection, auto select, ai selection]
related: [selection-basics, quick-selection-and-magic-wand, select-and-mask, modify-selections, remove-background]
updated: 2026-11-14
---

Four commands in the **Select** menu build a selection for you in one step. They are simple, predictable approximations that run entirely in your browser: they look at colour, brightness and position, not at what the picture shows. Use them as a starting point and refine the result.

![Select > Sky on a landscape: the selection covers the sky above the mountains](img/select-sky-result.jpg "Select > Sky follows the bright upper part of the image down to the skyline")

| Command | How it decides |
|---|---|
| **Select > Subject** | Selects pixels that differ from the average colour along the image border, favouring the centre of the image. |
| **Select > Sky** | Selects blue or bright pixels in the upper part of the image and fades out towards a horizon. |
| **Select > Object Selection…** | Grows a region of connected, similar colour from a point you give. |
| **Select > Focus Area…** | Selects areas with strong local contrast (sharp detail), which are usually the in-focus parts. |

All four look at the whole visible image and follow the **Selection mode** in Selection options, so you can add or subtract their result from an existing selection. The status bar labels the result, for example "Sky selection created (local offline proxy)".

## Subject and Sky

Choose **Select > Subject** or **Select > Sky**. There are no settings; the selection appears straight away.

Subject works best on a subject that stands out against a fairly even background. Sky works best on daylight or sunset skies above a clear skyline.

## Object Selection

1. Choose **Select > Object Selection…**.
2. The **Object Selection** dialog asks for:
   - **Point X** and **Point Y**: the position of a pixel inside the object, in image pixels from the top-left corner. The centre of the image is suggested, and the point must lie inside the image. The document size is shown next to the document name, which helps you estimate a position.
   - **Colour tolerance** (0–255): how different neighbouring colours may be (default 32).
   - **Edge softness** (0–255): how soft the edge is (default 8).
3. Click **Select** or press <kbd>Enter</kbd>. Out-of-range values are marked in red and keep **Select** unavailable; **Cancel** or <kbd>Esc</kbd> stops without changing the selection.

## Focus Area

1. Choose **Select > Focus Area…**.
2. Set **Threshold (0–255)**: higher values keep only the strongest detail (default 32).
3. Set **Softness (0–255)**: how gradually the selection fades (default 24).
4. Click **Apply Focus Area**.

## Limits

> [!IMPORTANT]
> These commands do not use AI or object recognition, and nothing is uploaded. They can miss parts of a subject that match the background, include background that contrasts with its surroundings, and they do not separate hair or fine detail.

To improve the result:

- Add or remove areas with the [Selection Brush](selection-brush), [Quick Selection](quick-selection-and-magic-wand) or [Quick Mask](select-and-mask).
- Smooth or soften the edge with [Select and Mask…](select-and-mask) or [Modify selections](modify-selections).
- To cut a subject out, [Remove Background](remove-background) creates a layer mask instead of a selection.
