---
title: Lighten, darken and change saturation with Dodge, Burn and Sponge
summary: Brush light and shadow into an image with Dodge and Burn, targeting shadows, midtones or highlights, and saturate or desaturate areas with the Sponge.
category: retouching
order: 50
level: beginner
keywords: [dodge, burn, sponge, lighten, darken, saturate, desaturate, toning, contour]
tools: [dodge, burn, sponge]
related: [blur-and-sharpen-tools, adjustment-brush, levels, hue-saturation-and-color-balance]
updated: 2026-11-14
---

Dodge, Burn and Sponge are toning brushes. **Dodge** lightens, **Burn** darkens and **Sponge** raises or lowers colour saturation where you paint. They share one toolbar button in the **Retouch** group; press <kbd>O</kbd> to cycle through them (<kbd>Shift</kbd>+<kbd>O</kbd> cycles backwards).

![A landscape where Dodge has lightened the left mountain and Burn has darkened the lake, with the Range menu highlighted](img/dodge-burn-sponge.jpg "Dodge on the left mountain and Burn across the lake, both with a soft 260 px brush")

## Dodge or burn an area

1. Choose **Dodge** or **Burn** (<kbd>O</kbd>).
2. Set **Size** and a low **Hardness** for gradual edges.
3. Choose a **Range**: **Shadows**, **Midtones** (default) or **Highlights**. The tool affects pixels in that tonal range most.
4. Set **Exposure** to control how strong each stroke is. Start low (10–20%) and build up with several strokes.
5. Paint over the area.

| Option | What it does |
|---|---|
| Exposure | Strength of the lightening or darkening (default 50%). |
| Flow | Scales how much each part of the stroke applies. |
| Range | Which tones are affected most. |

Dodge moves colours towards white and Burn towards black. Transparency is never changed.

## Sponge

1. Choose **Sponge** (<kbd>O</kbd> until it is selected).
2. Choose a **Mode**: **Saturate** or **Desaturate**.
3. Set **Vibrance** (the strength) and **Flow**.
4. Paint over the area.

The Sponge changes saturation only; hue and lightness stay the same.

> [!TIP]
> These tools change the layer's pixels directly. To keep the original, duplicate the layer first, or use the [Adjustment Brush](adjustment-brush), which paints adjustments you can change later.

## Good to know

- The tools work on visible, unlocked pixel layers. Fully transparent pixels are skipped.
- With an active selection, only pixels inside it change; a feathered edge blends gradually.
- Each stroke is one undo step. A stroke that changes nothing (for example over transparent pixels) adds no history step.
- Pen pressure does not change exposure, and these tools do not use [Paint symmetry](paint-symmetry).
