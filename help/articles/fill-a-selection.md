---
title: Fill a selection
summary: Fill a selection or a whole layer with a colour or a repeating pattern, including the Mesh fishnet, using Edit > Fill… and the quick-fill shortcuts.
category: selections
order: 110
level: beginner
keywords: [fill, fill selection, fill layer, pattern fill, mesh, fishnet, checker, stripes, foreground color, 50% gray, shift f5]
related: [stroke-a-selection, selection-basics, paint-bucket, patterns, blend-modes-and-opacity]
updated: 2026-11-14
---

**Edit > Fill…** fills the selection on the active layer with a colour or a repeating pattern. Without a selection, it fills the whole layer. To fill an area of similar colour with a click, use the [Paint Bucket](paint-bucket) instead.

Fill works on a visible, unlocked raster (pixel) layer. For text, shape or adjustment layers, add a new paint layer first (**Layer > New Paint Layer**).

## Fill with a colour

1. Make a selection (or none, to fill the whole layer) and select the layer to fill.
2. Choose **Edit > Fill…** or press <kbd>Shift</kbd>+<kbd>F5</kbd>.
3. Choose **Contents**: Foreground Color, Background Color, Color… (pick any colour), Black, White or 50% Gray.
4. Optionally set **Mode** (a blend mode) and **Opacity (%)** (a whole number from 1 to 100).
5. Click **Fill**, or press <kbd>Enter</kbd> to accept the defaults.

### Quick fills

| Command | Shortcut |
|---|---|
| **Edit > Fill with Foreground Color** | <kbd>Alt</kbd>+<kbd>Backspace</kbd> (<kbd>Option</kbd>+<kbd>Delete</kbd> on Mac) |
| **Edit > Fill with Background Color** | <kbd>Ctrl</kbd>+<kbd>Backspace</kbd> (<kbd>⌘</kbd>+<kbd>Delete</kbd> on Mac) |

Quick fills use 100% opacity and Normal mode, and respect the selection in the same way.

## Fill with a pattern

![The Fill dialog with Contents set to Pattern, Pattern Mesh, a 24 px tile and Transparent background ticked](img/fill-dialog-pattern.jpg "Edit > Fill… with a pattern")

1. In **Contents**, choose **Pattern**.
2. Choose a **Pattern**: Checker, Stripes, Dots, Grid, Diagonal or Mesh, or a pattern you defined from a selection with the Pattern Stamp (see [Patterns](patterns)).
3. For the built-in patterns, set **Tile size (px)**, a whole number from 4 to 128.
4. Leave **Transparent background (lines only)** ticked to draw only the pattern's lines in the foreground colour, so the gaps leave the layer untouched. Untick it to fill the gaps with the background colour.
5. Click **Fill**.

The preview swatch shows one tile with your current colours. The dialog starts on the Pattern Stamp's current pattern and tile size. Patterns line up with the layer's top-left corner, so repeated fills join seamlessly. Patterns defined from a selection are used at their own size and colours.

![A dark Mesh fishnet pattern filled into a rectangular selection over a portrait](img/fill-mesh-result.jpg "The Mesh pattern: a diamond fishnet lattice, with the image showing through the gaps")

**Mesh** is a diamond (fishnet) lattice of lines along both diagonals, useful for netting, fences or textile effects. Line thickness grows with the tile size.

## Good to know

- A feathered or partly selected edge fades the fill in proportion; unselected pixels never change.
- Each fill is one undo step.
- If the selection covers no pixels, Fill does not open and shows **No pixels are selected**.
- Fill options are not saved with the document; the dialog starts fresh each time.
