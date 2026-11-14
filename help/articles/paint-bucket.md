---
title: Fill areas with the Fill tool (paint bucket)
summary: Click an area of similar colour to fill it with the foreground colour, using Color tolerance, Contiguous and Sample All Layers.
category: painting
order: 90
level: beginner
keywords: [paint bucket, bucket fill, flood fill, fill tool, fill colour, fill color]
tools: [fill]
related: [gradient-tool, choosing-colors, fill-a-selection, quick-selection-and-magic-wand]
updated: 2026-11-14
---

The Fill tool, often called the paint bucket, fills an area of similar colour with the foreground colour in one click.

![The dark lower mountain ridge of a landscape filled with teal by one click of the Fill tool, with the Contiguous option highlighted](img/paint-bucket-fill.jpg "One click filled the connected dark ridge (Color tolerance 24, Contiguous on)")

## Fill an area

1. Choose **Fill** from the Gradient flyout in the **Paint & Fill** group, or press <kbd>G</kbd> until it is selected.
2. Set the **Color** well to the fill colour.
3. Click the area you want to fill.

## Options

| Option | What it does |
|---|---|
| Color tolerance | How different a pixel can be from the clicked pixel and still be filled, from 0 to 255. Each colour channel is compared separately. |
| Contiguous | On (default): fill only the matching area connected to the click. Off: fill every matching pixel on the layer. |
| Sample All Layers | Decide what matches by looking at the whole visible image instead of the active layer. The fill is still painted only into the active layer. |

The fill has a hard edge (no anti-aliasing). If nothing matches, the editor shows "No contiguous pixels matched at that point" (or "No pixels matched that colour" with Contiguous off).

> [!TIP]
> To fill an empty layer over a photo, add a new layer, turn on **Sample All Layers** and click the area in the photo. The fill lands on the new layer, so the photo stays untouched.

## Fill a selection

With an active selection, the Fill tool only fills inside it; a click outside does nothing and shows "Click inside the selection to fill".

To fill a whole selection or layer regardless of colour, use:

- **Edit > Fill with Foreground Color** (<kbd>Alt</kbd>+<kbd>Backspace</kbd>)
- **Edit > Fill with Background Color** (<kbd>Ctrl</kbd>+<kbd>Backspace</kbd>)
- **Edit > Fill…** (<kbd>Shift</kbd>+<kbd>F5</kbd>) for black, white, grey, any colour or a pattern, with a blend mode and opacity.

See [Fill a selection](fill-a-selection).
