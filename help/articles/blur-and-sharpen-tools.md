---
title: Soften and sharpen details with the Blur and Sharpen tools
summary: Brush a local blur onto distracting details or sharpen small areas with the Blur and Sharpen tools.
category: retouching
order: 60
level: beginner
keywords: [blur tool, sharpen tool, soften, local blur, local sharpen, focus, detail]
tools: [blur, sharpen]
related: [smudge-tool, dodge-burn-and-sponge, blur-filters, sharpen-filters]
updated: 2026-11-14
---

The Blur and Sharpen tools apply a blur or a sharpening effect only where you paint. Use Blur to soften a busy background or skin texture, and Sharpen to bring out small details such as eyes or text.

![The lower left buildings of a night skyline softened with several Blur strokes, with the Flow slider highlighted](img/blur-sharpen-tools.jpg "Four Blur strokes with a 200 px brush over the lower left buildings")

## Blur or sharpen an area

1. In the **Retouch** group, press and hold (or right-click) the Smudge button and choose **Blur** or **Sharpen**. The three tools share one button.
2. Set **Size**, **Hardness** and **Flow**. Flow sets the strength of each stroke.
3. Paint over the area. Paint over it again to strengthen the effect.

| Tool | What it does |
|---|---|
| Blur | Averages each pixel with its neighbours under the brush. |
| Sharpen | Increases the contrast of fine detail under the brush. |

Pressure options for size and opacity are available for pen and touch input.

> [!WARNING]
> Sharpening the same area repeatedly quickly creates harsh edges and noise. Use a low Flow and few strokes.

## Good to know

- Each stroke reads the layer as it was when the stroke started, so passing over the same spot in one stroke does not compound the effect. Use several strokes for a stronger result.
- Transparency is kept, and only pixels inside an active selection change.
- Each stroke is one undo step.
- For an even effect across a whole layer or selection, use **Filter > Blur** or **Filter > Sharpen** instead. See [Blur filters](blur-filters) and [Sharpen filters](sharpen-filters).
- To push pixels around rather than blur them, use the [Smudge tool](smudge-tool).
