---
title: Liquify
summary: Twist, push or reshape the area around a point with Filter > Liquify…, an editable local warp that keeps your original pixels.
category: filters
order: 130
level: intermediate
keywords: [liquify, warp, push, twist, bloat, reshape, slim, face, distort]
related: [distort-filters, perspective-and-puppet-warp, smudge-tool, filters-overview]
updated: 2026-11-14
---

**Filter > Liquify…** reshapes a round area around a centre point: it can twist it, push it to one side, or enlarge it. It is a live filter, so you can move the centre or change the strength at any time, and the original pixels stay untouched.

Liquify in PixelForge works on one area at a time with sliders. It is not a brush: you cannot paint warps freely, and there are no face-aware controls. For a brush that drags pixels, use the [Smudge tool](smudge-tool); for pinning and bending shapes, see [Perspective and Puppet Warp](perspective-and-puppet-warp).

![Liquify in Twist mode sweeps the hair around a centre on the face](img/liquify-twist.jpg "Filter > Liquify…, Twist mode")

## Use Liquify

1. Select a visible, unlocked layer.
2. Choose **Filter > Liquify…**.
3. Open the **Filters** panel to see the settings in **Filter effects**.
4. Choose a **Liquify mode**.
5. Drag the crosshair on the canvas to the area you want to change, or type the exact position in **Filter center X (px)** and **Filter center Y (px)**.
6. Set **Liquify radius** to the size of the area, then adjust **Effect amount** and **Liquify angle**.

The change is strongest at the centre and fades to nothing at the edge of the area, so there are no hard seams.

## Options

| Option | Range | Default | What it does |
|---|---|---|---|
| Liquify mode | Twist, Push, Bloat | Twist | **Twist** rotates the area around the centre. **Push** shifts it in the direction of **Liquify angle**. **Bloat** enlarges the content under the radius without turning it, as if it swelled outwards from the centre. |
| Effect amount | 0–100 % | 70 % | Strength of the warp. |
| Liquify radius | 1–70 % of shorter side | 44 % | Radius of the affected circle, as a share of the layer's shorter side. |
| Liquify angle | −180° to 180° | 75° | Twist: how far and which way the area turns. Push: the direction of the push (0° pushes to the right, 90° downwards). Not used by Bloat. |
| Liquify center X / Liquify center Y | 0–100 % | 50 % | Position of the centre. |

> [!TIP]
> Need two warps in different places? Apply Liquify, then click **Add filter to stack** in the Filters panel and apply **Filter > Liquify…** again with a different centre. See [Smart filters and filter stacks](smart-filters).
