---
title: Content-Aware Fill and Content-Aware Move
summary: Fill a selection from the pixels around it, or move a selected area and fill the gap it leaves, with two local, editable cleanup commands.
category: retouching
order: 40
level: intermediate
keywords: [content aware fill, content-aware, remove object, fill selection, move object, cleanup, inpaint]
related: [spot-healing-and-healing, patch-tool, generative-and-local-ai-tools, selection-basics]
updated: 2026-11-14
---

**Edit > Content-Aware Fill…** and **Edit > Content-Aware Move…** are cleanup commands for small objects on simple backgrounds. Both run locally in your browser, keep the original pixels and stay editable through undo, reload and project files.

They fill from the colours just outside the selection. They do not recognise objects, rebuild perspective or invent new detail, so they work best on skies, walls, water and other plain areas.

![A small tree inside a rectangular selection replaced by colours from the surrounding shore and lake, leaving a faint ghost](img/content-aware-fill-tree.jpg "Content-Aware Fill over a small tree")

## Content-Aware Fill

1. Select the object to remove on a visible, unlocked pixel layer. Leave a small margin of background around it.
2. Choose **Edit > Content-Aware Fill…**. The fill is applied straight away at full strength and the status bar shows "Content-Aware Fill applied locally; source and alpha remain unchanged".

Each pixel in the selection takes the typical colour of the nearest unselected pixels around it. Undo removes the fill.

How far the fill looks for surrounding colour depends on the size of the selection: about half its width or height, whichever is larger, and at most 128 px. Brush settings such as **Size** and **Opacity** have no effect. A selection up to about 250 px across is filled throughout.

The status bar tells you when the fill could not do everything:

- "Content-Aware Fill applied locally to N% of the selection; the rest has no unselected pixels within … px": the selection is so large that its middle is more than 128 px from any unselected pixel. That part is left as it was. Fill a large area in smaller pieces.
- "Content-Aware Fill found no unselected pixels around the selection; nothing changed": there is nothing outside the selection to copy from, for example after **Select > All**.

Limits: up to 16 Content-Aware Fill operations per layer.

## Content-Aware Move

Content-Aware Move moves the selected pixels by a fixed distance and fills the place they came from.

1. Select the object on a visible, unlocked pixel layer.
2. Choose **Edit > Content-Aware Move…**.
3. Your browser asks for the horizontal distance in pixels (positive moves right), then the vertical distance (positive moves down). Distances can be up to ±4,096 px.
4. The selected pixels are moved and the gap is filled at full strength from the surrounding colours, searching as far as Content-Aware Fill does for the same selection.

Cancel either prompt to leave the image unchanged. Up to 16 moves can be stored per layer.

## Choosing the right tool

| Problem | Try |
|---|---|
| Dust, spots, small blemishes | [Spot Healing](spot-healing-and-healing) |
| A mark with a matching clean area nearby | [Patch tool](patch-tool) |
| Detailed texture to copy exactly | [Clone tool](clone-and-pattern-stamp) |
| A small object on a plain background | Content-Aware Fill |
| Stretching a photo while protecting subjects | [Content-Aware Scale](content-aware-scale) |
