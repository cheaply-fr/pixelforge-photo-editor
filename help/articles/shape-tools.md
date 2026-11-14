---
title: Draw shapes
summary: Draw editable rectangles, rounded rectangles, ellipses, lines, polygons and stars with the shape tools, and set their fill, stroke and size.
category: shapes-paths
order: 10
level: beginner
keywords: [rectangle, square, circle, oval, ellipse, line, arrow, polygon, triangle, star, shape layer, vector shape, fill, stroke, outline]
tools: [rectangle, rounded-rectangle, ellipse, line, polygon]
related: [custom-shapes, pen-tools, paths-and-work-paths, vector-masks, layer-types]
updated: 2026-11-14
---

The shape tools draw vector shapes as their own layers. A shape stays sharp and editable: you can move, resize and recolour it at any time, and it is only turned into pixels when you export or rasterize it.

![A five-pointed orange star with a white outline drawn over a sunset photo, with the Polygon tool's Fill and Stroke options highlighted](img/shape-polygon-star.jpg "A star drawn with the Polygon tool")

## Draw a shape

1. Choose a shape tool from the **Rectangle** slot in the **Draw & Type** group of the toolbar. Press and hold (or right-click) the slot to see them all: **Rectangle**, **Rounded Rectangle**, **Ellipse**, **Line**, **Polygon** and **Custom Shape**. You can also press <kbd>U</kbd> to cycle forwards through the family and <kbd>Shift</kbd>+<kbd>U</kbd> to cycle backwards.
2. Set the fill and stroke in **Tool options** (see below).
3. Drag on the canvas. A preview of the real shape follows the pointer.

While dragging (all shapes except Line):

- Hold <kbd>Shift</kbd> to keep the proportions: a square, a circle or a regular polygon.
- Hold <kbd>Alt</kbd> (<kbd>Option</kbd> on Mac) to draw from the centre.

Each shape becomes a new layer named after the tool, such as "Rectangle 1" or "Ellipse 2", and the status bar says it was added. One <kbd>Ctrl</kbd>+<kbd>Z</kbd> removes it.

### Create a shape of an exact size

Under **New**, enter a width and height (1 to 16,000 px) and click **Create**. The shape is added in the centre of the canvas.

## Fill and stroke

All shape tools share the same options:

| Option | Choices |
|---|---|
| Fill | Foreground colour (default), Background colour, Custom colour or None |
| Stroke | None (default), Foreground colour, Background colour or Custom colour |
| Stroke width | 1 to 100 px (default 4 px) |

- By default shapes are filled with the foreground colour and have no outline.
- Set **Fill** to **None** and choose a **Stroke** to draw an outline only.
- If both Fill and Stroke are None, nothing is drawn and the status bar tells you so.
- The **Line** tool has no fill. It draws in the Stroke colour, or in the foreground colour when Stroke is None, at the Stroke width.

Change the colours with the colour wells at the bottom of the toolbar; see [Choose colours](choosing-colors).

## Tool-specific options

| Tool | Options |
|---|---|
| Rounded Rectangle | **Corner radius** (0 to 500 px). The radius is limited to half the shorter side, so a large radius draws a pill or a circle. |
| Polygon | **Polygon variant**: Polygon, Triangle or Star. **Polygon sides** sets the number of sides or points; stars also have a **Star inner radius**. |

## Edit a shape later

Select the shape layer in the [Layers panel](layers-panel). Its properties include the fill colour and, for filled shapes, a layer stroke with its own colour and width. Rectangles, including those drawn with the Rectangle tool, have an editable corner radius. Use the [Move tool](move-and-align) or [Free transform](free-transform) to move, resize or rotate the shape.

To combine overlapping shapes into one, see [Paths and work paths](paths-and-work-paths).

> [!TIP]
> To reuse a shape's look, save it as a tool preset (see [Tool presets](tool-presets)) or with **Edit > Define Custom Shape…** (see [Custom shapes](custom-shapes)).
