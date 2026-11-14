---
title: Bend a layer with Perspective Warp and Puppet Warp
summary: Map a layer onto four corner points with Edit > Perspective Warp…, or push parts of it with up to eight pins using Edit > Puppet Warp…, by typing coordinates.
category: transform-view
order: 70
level: advanced
keywords: [perspective warp, puppet warp, distort, warp layer, pins, mockup, skew corners, bend]
related: [free-transform, perspective-crop, liquify, vanishing-point]
updated: 2026-11-14
---

**Edit > Perspective Warp…** and **Edit > Puppet Warp…** reshape the pixels of the active layer. Both are simple, numeric versions of these effects: you type the points into your browser's prompt boxes rather than dragging a mesh on the canvas. For freehand pushing and pulling, [Liquify](liquify) is often easier.

![The Edit menu with Free Transform, Perspective Warp…, Puppet Warp… and Content-Aware Scale… highlighted](img/edit-menu-warps.jpg "Transform and warp commands in the Edit menu")

Both commands need a visible, unlocked image or smart object layer. They replace the layer's pixels with the warped result at the same size; **Undo** brings back the original.

## Coordinates

Points are in the layer's own pixels, measured from its top-left corner: x increases to the right and y increases downwards. For a layer that fills a 1600 × 1000 canvas, the bottom-right corner is `1600,1000`.

## Perspective Warp

Perspective Warp fits the whole layer into a four-sided shape that you define, for example to place artwork onto a sign or a screen in a photo.

1. Select the layer and choose **Edit > Perspective Warp…**.
2. Your browser asks for the **target quad**: four x,y points separated by semicolons, in clockwise order starting at the top-left. The suggested value is the layer's own corners, 10 px in from each edge.
3. Edit the points, for example `100,50; 1500,150; 1450,900; 150,980`, and confirm.

The layer's top-left corner moves to the first point, top-right to the second, bottom-right to the third and bottom-left to the fourth. Pixels outside the new shape become transparent. The shape must be convex (no inward corners).

## Puppet Warp

Puppet Warp moves parts of a layer by pins. Each pin is written as `x,y,dx,dy`: where the pin is, and how far to move it right (dx) and down (dy). Separate pins with semicolons; you can use one to eight pins.

1. Select the layer and choose **Edit > Puppet Warp…**.
2. Type the pins, for example `300,500,0,0; 800,250,0,-90; 1300,500,0,0`, and confirm.

![A portrait after Puppet Warp: the middle of the layer lifted while two still pins hold the sides](img/puppet-warp-result.jpg "Puppet Warp with one moving pin between two still pins")

Pins with `0,0` as their movement hold the area around them in place. Each part of the layer moves by a blend of the pins, weighted towards the nearest ones.

> [!IMPORTANT]
> Always add still pins (dx and dy of 0) around the area you want to move. With a single pin, every part of the layer is pulled by that one pin, so the whole layer simply shifts. Areas the layer is pulled away from become transparent.

## Limits

- Pixels are resampled with nearest-neighbour sampling, so strong warps can look slightly jagged.
- There is no mesh, rigid-region or on-canvas pin editing; to adjust, undo and run the command again with new values.
- Layers are limited to 16 megapixels.
