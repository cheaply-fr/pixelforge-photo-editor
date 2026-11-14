---
title: Remove spots with the Spot Healing and Healing tools
summary: Paint over dust, blemishes and small marks with the Spot Healing tool, or copy from a source point you choose with the Healing tool.
category: retouching
order: 10
level: beginner
keywords: [spot healing, healing brush, blemish, dust, remove spot, retouch skin, remove mark, heal]
tools: [spot-heal, heal]
related: [patch-tool, clone-and-pattern-stamp, content-aware-fill-and-move, red-eye-tool]
updated: 2026-11-14
---

The Spot Healing and Healing tools hide small defects such as dust, spots, blemishes and short scratches. Spot Healing fills the stroke from the pixels around it automatically. Healing copies from a source point you choose, like the Clone tool, but blends the result partly with the pixels underneath.

Both are local approximations designed for small marks with plain surroundings. They do not recognise objects and work less well on large objects, busy textures or edges in perspective.

![A small tree on the shore of a landscape painted over with Spot Healing, leaving only a faint smudge, with the Type menu highlighted](img/spot-healing-tree.jpg "One Spot Healing stroke (Content-Aware, Size 90) over a small tree")

## Spot Healing

1. Choose **Spot Healing**: press and hold (or right-click) the Healing button in the **Retouch** group, or press <kbd>J</kbd> until it is selected.
2. Set **Size** a little larger than the mark.
3. Choose a **Type** (see below).
4. Click the mark, or paint over it in one stroke.

The stroke is stored with the layer as an editable operation instead of overwriting the original pixels, so you can undo it at any time, even after reloading the draft. A layer can hold up to 128 Spot Healing strokes.

### Type

| Type | What it does |
|---|---|
| Content-Aware (default) | Treats the whole stroke as a hole and fills it from the pixels around it, so gradients and edges that cross the stroke continue through it. |
| Create Texture | Like Content-Aware, then adds fine detail copied from a nearby area, so the fill is not too smooth. |
| Proximity Match | Fills each point from the pixels just outside the brush around it. |

**Hardness** softens the edge of the repair and **Opacity** blends it with the original.

> [!TIP]
> Cover the whole mark in a single stroke. If parts of the mark stay outside the stroke, they can bleed into the repair; paint a second stroke to clean them up.

## Healing

The Healing tool copies pixels from a source point like the [Clone tool](clone-and-pattern-stamp), and blends them at about two thirds strength over the pixels underneath. The result is softer than a clone, but the original can still show through, so it suits small, soft marks rather than solid objects.

![A small tree partly covered by a Healing stroke copied from the shoreline, with the source crosshair and the Aligned option highlighted](img/healing-brush-source.jpg "A Healing stroke over the small tree: the original still shows through faintly")

1. Choose **Healing** (<kbd>J</kbd>).
2. <kbd>Alt</kbd>+click (<kbd>Option</kbd>+click on Mac) a clean area to set the source. A white crosshair marks it.
3. Paint over the defect. The source moves with your brush.

| Option | What it does |
|---|---|
| Aligned | On (default): the distance between source and brush stays the same for every stroke. Off: every stroke starts again from the source point. |
| Sample | **Current Layer**, **Current & Below** or **All Layers**: which layers the source pixels come from. With the last two you can heal on an empty layer above the photo. |
| Size, Hardness, Opacity, Spacing, Angle, Roundness | Brush tip options, as for the Brush. |

Healing also supports pen pressure and [Paint symmetry](paint-symmetry).

## Good to know

- Both tools work on visible, unlocked pixel layers.
- With an active selection, the repair stays inside it, even after you deselect or reload.
- Spot Healing reads surrounding pixels from the same layer. On a separate empty layer it has nothing to work with.
- For larger areas, try the [Patch tool](patch-tool) or [Content-Aware Fill](content-aware-fill-and-move).
