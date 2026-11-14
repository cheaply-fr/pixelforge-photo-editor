---
title: Lens Correction and Adaptive Wide Angle
summary: Make small manual radial corrections around a point with Filter > Lens Correction… and Filter > Adaptive Wide Angle…, and understand their limits.
category: filters
order: 150
level: advanced
keywords: [lens correction, distortion, barrel, pincushion, wide angle, fisheye, adaptive wide angle, straighten lines]
related: [distort-filters, perspective-and-puppet-warp, crop-and-straighten, filters-overview]
updated: 2026-11-14
---

**Lens Correction…** and **Adaptive Wide Angle…** bend the pixels inside a circle around a centre point outwards or inwards. They are manual, local corrections: PixelForge does not read lens profiles or camera data, does not correct colour fringes (chromatic aberration) and does not detect lines for you. Both are live filters, so you can adjust or remove them later.

![Lens Correction settings in the Filter effects section](img/lens-correction-panel.jpg "Filter > Lens Correction…")

> [!IMPORTANT]
> The **Correction radius** is measured in layer pixels and is at most 64 px. Only pixels within that distance of the centre change; the rest of the layer is untouched. On a large photo this is a small area, so these filters suit small, local fixes rather than whole-frame lens distortion. For whole-picture geometry, see [Perspective and Puppet Warp](perspective-and-puppet-warp) and [Crop and straighten](crop-and-straighten).

## Lens Correction

1. Select a visible, unlocked layer.
2. Choose **Filter > Lens Correction…**.
3. Open the **Filters** panel and adjust **Filter effects**.
4. Drag the crosshair on the canvas to the middle of the area to correct.

| Option | Range | Default | What it does |
|---|---|---|---|
| Effect amount | 0–100 % | 75 % | Strength of the correction. |
| Correction radius | 1–64 px | 64 px | Radius of the circle that is corrected. |
| Correction direction | Sample inward, Sample outward | Sample inward | **Sample inward** takes pixels from closer to the centre, so the content inside the circle swells outwards. **Sample outward** does the opposite and draws the content in. |
| Correction centre X / Y | 0–100 % | 50 % | Position of the centre. You can also use **Filter center X (px)** / **Filter center Y (px)** or the crosshair. |

The correction is zero at the centre and at the edge of the circle and strongest in between, so there is no visible seam.

## Adaptive Wide Angle

Works like Lens Correction but lets you correct more horizontally or more vertically.

| Option | Range | Default | What it does |
|---|---|---|---|
| Effect amount | 0–100 % | 75 % | Strength of the correction. |
| Correction radius | 1–64 px | 64 px | Radius of the circle that is corrected. |
| Correction centre X / Y | 0–100 % | 50 % | Position of the centre, which stays fixed. |
| Horizontal line bias | 0–100 % | 50 % | How strongly the correction acts in the horizontal direction. |
| Vertical line bias | 0–100 % | 50 % | How strongly the correction acts in the vertical direction. |

Setting the two biases differently gives an oval-shaped correction instead of a round one. You cannot draw constraint lines.

> [!TIP]
> Compare before and after by dragging **Effect amount** to 0 % and back, or by clearing the filter and pressing <kbd>Ctrl</kbd>+<kbd>Z</kbd> to bring it back.
