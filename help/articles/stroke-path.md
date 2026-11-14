---
title: Stroke a path with a brush
summary: Paint along a path with the Brush, Pencil, Eraser or Smudge tool, with optional simulated pen pressure that tapers the ends.
category: shapes-paths
order: 60
level: intermediate
keywords: [stroke path, brush along path, outline, trace path, taper, pressure, line art, signature]
related: [pen-tools, paths-and-work-paths, brush-tool, stroke-a-selection]
updated: 2026-11-14
---

**Stroke Path with Brush** paints your current brush along the curves of a path, onto a pixel layer. It is a quick way to get smooth, tapered lines that would be hard to draw by hand.

![The Stroke Path with Brush dialog with Tool, Path, Paint onto, Simulate pressure, taper and pressure options](img/stroke-path-dialog.jpg "Stroke Path with Brush")

## Stroke a path

1. Draw a path with the [Pen tools](pen-tools). A work path (**Pen mode: Path**) is ideal.
2. Set up the brush you want to paint with: colour, size, hardness and so on (see [Paint with the Brush tool](brush-tool)).
3. Make sure there is a visible, unlocked pixel layer to paint on. Add one with **Layer > New Paint Layer** if you want to keep the stroke separate.
4. Open the dialog: click **Stroke Path with Brush…** in the Tool options of any Pen or path tool, or choose **Layer > Stroke Path with Brush…**.
5. Choose the options below and click **Stroke path**.

The whole stroke is one undoable step. If there is an active selection, painting stays inside it.

## Options

| Option | What it does |
|---|---|
| Tool | Paint with the **Brush**, **Pencil**, **Eraser** or **Smudge** settings. |
| Path | The path layer to follow. When the document has more than one path layer, **All visible path layers** strokes every visible path at once. |
| Paint onto | The pixel layer that receives the paint. |
| Simulate pressure | Varies the stroke along its length as if drawn with a pressure-sensitive pen. On by default. |
| Taper start / Taper end (%) | How much of the stroke, at each end, fades in or out. Whole numbers from 0 to 100; default 25. |
| Minimum size (%) | The thinnest the stroke gets at the tips, as a percentage of the brush size. Default 0. |
| Pressure controls | Whether simulated pressure changes the **Size** (on by default) and the **Opacity** (**Strength** for Smudge). |

If there is no layer to paint on, the dialog says "Add or unlock a visible paint layer to stroke onto." and **Stroke path** stays unavailable.

> [!TIP]
> Draw the path as a work path, stroke it onto a new paint layer, then hide or delete the work path. You keep the painted line and can stroke the same path again with another colour or size.

To stroke the edge of a selection instead of a path, use [Stroke a selection](stroke-a-selection).
