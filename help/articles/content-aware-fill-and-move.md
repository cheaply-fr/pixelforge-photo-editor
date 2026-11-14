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

![A small tree inside a rectangular selection replaced by colours from the surrounding shore and lake, leaving a faint ghost](img/content-aware-fill-tree.jpg "Content-Aware Fill over a small tree, with Size set to 200 px first")

## Content-Aware Fill

1. Select the object to remove on a visible, unlocked pixel layer. Leave a small margin of background around it.
2. Choose a painting tool, for example the Brush, and set **Size** to about twice the width of the selection (up to 256 px). See the note below.
3. Choose **Edit > Content-Aware Fill…**. The fill is applied straight away and the status bar shows "Content-Aware Fill applied locally; source and alpha remain unchanged".

Each pixel in the selection takes the typical colour of the nearest unselected pixels around it. Undo removes the fill.

> [!IMPORTANT]
> Content-Aware Fill looks for surrounding colour up to **half the current brush Size** away (from 4 to 128 px). With the default Size of 18 px, only a thin band along the selection edge changes, and the middle of a wider selection stays as it was. Increase the Size before running the command.

Limits: up to 16 Content-Aware Fill operations per layer. A selection with no unselected pixels within reach is left unchanged.

## Content-Aware Move

Content-Aware Move moves the selected pixels by a fixed distance and fills the place they came from.

1. Select the object on a visible, unlocked pixel layer.
2. Choose **Edit > Content-Aware Move…**.
3. Your browser asks for the horizontal distance in pixels (positive moves right), then the vertical distance (positive moves down). Distances can be up to ±4,096 px.
4. The selected pixels are moved and the gap is filled from the surrounding colours.

Cancel either prompt to leave the image unchanged. Up to 16 moves can be stored per layer.

## Choosing the right tool

| Problem | Try |
|---|---|
| Dust, spots, small blemishes | [Spot Healing](spot-healing-and-healing) |
| A mark with a matching clean area nearby | [Patch tool](patch-tool) |
| Detailed texture to copy exactly | [Clone tool](clone-and-pattern-stamp) |
| A small object on a plain background | Content-Aware Fill |
| Stretching a photo while protecting subjects | [Content-Aware Scale](content-aware-scale) |
