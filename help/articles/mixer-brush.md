---
title: Blend paint with the Mixer Brush
summary: Pick up and smear the colours already on the canvas with the Mixer Brush, controlled by Wet, Load, Mix and Flow.
category: painting
order: 60
level: intermediate
keywords: [mixer brush, blend colours, painterly, wet paint, smear, mix]
tools: [mixer-brush]
related: [smudge-tool, brush-tool, history-brushes, paint-symmetry]
updated: 2026-11-14
---

The Mixer Brush loads the colours under the start of the stroke and carries them along, picking up more colour from the canvas as it goes. Dragging from the sky into the sun smears sky colour into the sun. It does not use the foreground colour.

![Two Mixer Brush strokes have smeared mountain and sky colours across each other, with the Wet slider highlighted](img/mixer-brush-smear.jpg "Two Mixer Brush strokes with Wet and Load at 80%")

## Use the Mixer Brush

1. Choose **Mixer Brush** from the Brush flyout, press <kbd>B</kbd> until it is selected, or choose **Edit > Mixer Brush Tool**.
2. Select a pixel layer that already has colour on it. On an empty layer there is nothing to mix, and the editor shows "No Mixer Brush change".
3. Set **Size**, **Hardness** and the mixing options below.
4. Drag across the colours you want to blend.

## Options

| Option | What it does |
|---|---|
| Wet | How strongly the carried paint is laid down. Higher values give stronger, wetter smears. |
| Load | How long the brush keeps its paint. High Load carries the starting colour further; low Load lets the canvas colour take over quickly. |
| Mix | How much canvas colour the brush picks up at each dab. |
| Flow | How much paint each dab deposits. |
| Opacity | The overall strength of the stroke. |

**Pressure affects size**, **Pressure affects opacity** and [Paint symmetry](paint-symmetry) are also available. With symmetry, each copy picks up colour at its own position.

## Limits

The Mixer Brush is a bounded local approximation. It has no bristle simulation, no wet-paint build-up across strokes and no "clean brush" or "load brush" colour settings. For smearing with more control, try the [Smudge tool](smudge-tool).

Each stroke is one undo step. With an active selection, the stroke stays inside it.
