# Stroke Selection contract

`Edit > Stroke Selection…` draws an outline along the active selection's edge
onto the active raster layer. It replaces the earlier `Edit > Stroke…` prompt,
which only asked for a width, always used the foreground colour as an inner
border and replaced the layer's pixels instead of compositing over them.

## Options

| Option | Values | Default |
| --- | --- | --- |
| Width | 1–250 px in 0.5 px steps (a decimal comma is accepted) | 4 px |
| Color | any `#rrggbb`; "Use foreground" resets it | foreground colour |
| Location | Inside, Center, Outside | Center |
| Mode | the Canvas-native blend modes the Fill dialog offers | Normal |
| Opacity | whole percent, 1–100 | 100 % |

The dialog remembers the last options for the session. Invalid input disables
**Stroke** and shows the accepted range; Cancel and Escape change nothing.
Validation is `normalizeStrokeSelectionOptions` in `src/strokeSelection.ts`.

## Geometry

Every selection type (marquee, Lasso, Magic Wand, Color Range, feathered,
inverted, transformed, and compound Add/Subtract/Intersect results) is first
resolved to its rendered alpha plane in the layer's pixel space. The stroke
follows the edge where that coverage crosses 50 %, the same edge the marching
ants trace, so a feathered selection is stroked along its visible outline and
a compound selection along its composed outline (an Add has no seam where its
parts overlap; a subtracted hole gets its own outline).

The band is measured with an exact Euclidean distance transform
(Felzenszwalb–Huttenlocher). With signed distance *s* from the 50 % edge
(positive inside), Inside covers 0 ≤ *s* ≤ width, Outside −width ≤ *s* ≤ 0 and
Center |*s*| ≤ width / 2. Coverage ramps over one pixel at both band edges, so
curves and diagonals are antialiased and keep the same width as straight
edges. Pixels beyond the canvas count as unselected: Select All with Inside
draws a frame along the canvas edge, and an Outside stroke of Select All has
nothing to draw. The stroke itself is a hard-edged band; it is not feathered.

## Applying

The band is composited over the layer with the chosen opacity and blend mode
(source pixels outside the band are unchanged) and committed as one history
entry, so Undo restores the original pixels. A layer stored at its content
bounds is grown to the canvas first so Outside strokes are not clipped.
Without a selection the command is disabled; with an explicitly empty
selection it shows **No pixels are selected** and changes nothing (see
`selection-composition-contract.md`). Hidden, locked and non-raster layers are
refused.

This is a bounded local raster stroke. It is not an editable vector stroke or
a layer style, and it does not claim to match any other editor's Stroke
command pixel for pixel.

## Performance

Only the covered bounding box, grown by the stroke's outward reach, is
processed. Inside and Outside need one distance transform, Center two. A
lasso-sized stroke on a 3000 × 4000 document takes well under a second
locally; a Center stroke of a selection that covers most of such a document
takes about 1–2 s.

## Tests

`tests/stroke-selection.test.mjs`: option validation, exact distance
transform, band placement for each location on a rectangle, equal width on
straight, diagonal and curved edges, feathered (50 % edge) and compound
selections, canvas-edge and empty selections, malformed input and a
3000 × 4000 timing bound. `tests/browser/stroke-selection.spec.ts` (desktop
and mobile): pixels on each side of a marquee edge for Inside/Center/Outside
with undo, colour, opacity and Multiply, remembered options, invalid input,
Cancel and Escape, a feathered Lasso plus Add, a subtracted hole surviving
reload, and the disabled/empty-selection cases.
