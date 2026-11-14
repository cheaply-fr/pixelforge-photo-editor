---
title: Lens Flare
summary: Add a camera-style flare with a glow, a star streak and coloured ghost rings using Filter > Render > Lens Flare…, on the photo or on its own empty layer.
category: filters
order: 80
level: intermediate
keywords: [lens flare, flare, sun flare, glare, ghost, anamorphic streak, glow]
related: [light-rays, render-filters, filters-overview]
updated: 2026-11-14
---

**Filter > Render > Lens Flare…** adds the kind of flare you see when a camera points towards a bright light: a glowing core, a ring, a thin star streak and four coloured "ghost" circles along the streak. It is a live filter, so you can move and restyle the flare at any time. It is a drawn approximation; it does not model a particular lens.

![A lens flare with a streak at 30 degrees over the city sky](img/lens-flare.jpg "Filter > Render > Lens Flare…")

## Add a lens flare

1. Select a layer. To keep the flare separate, add a new empty layer above your photo; new flares fill transparent pixels, so they show on an empty layer.
2. Choose **Filter > Render > Lens Flare…**.
3. Open the **Filters** panel to see the settings in **Filter effects**.
4. Drag the crosshair on the canvas to the light source, or type the position in **Filter center X (px)** and **Filter center Y (px)**.
5. Adjust size, brightness and angle.

## Options

| Option | Range | Default | What it does |
|---|---|---|---|
| Effect amount | 0–100 % | 75 % | Brightness of the flare. |
| Flare size | 1–64 | 36 | Size of the flare, relative to the layer: at 64 it spans about 92 % of the layer's shorter side. The panel shows "px", but the value is relative. |
| Flare centre X / Flare centre Y | 0–100 % | 50 % | Position of the flare's core. |
| Streak angle | −180° to 180° | 0° | Direction of the star streak. The ghost circles line up along the same direction. |
| Flare seed | 0–4294967295 | 0 | Picks a different colour and ghost layout. |
| Fill transparent pixels | on/off | on | Lets the flare's light fill empty pixels, so the flare works on its own layer. On opaque pixels it changes nothing. |

On opaque pixels the flare's light is added to the picture, so it only brightens.

> [!TIP]
> Render the flare on an empty layer and set that layer to **Screen**. You can then lower its opacity, move it with the Move tool, or erase part of it with a layer mask without re-rendering the photo.

> [!NOTE]
> Older documents with a Lens Flare made before **Fill transparent pixels** existed open with the option off, so they look the same as before.
