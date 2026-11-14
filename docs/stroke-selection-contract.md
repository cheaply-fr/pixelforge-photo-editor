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
nothing to draw: it changes nothing and says **Nothing to stroke: an Outside
stroke of a selection that fills the canvas lies entirely beyond the canvas
edge** (not "No pixels are selected", which is only for an empty selection). The stroke itself is a hard-edged band; it is not feathered.

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
processed, and within it only the band near the selection edge: the box is
cut into tiles (64 px, or twice the band's reach), tiles whose neighbourhood
is all selected or all unselected are skipped, and each remaining tile gets
an exact distance transform over its neighbourhood (falling back to one
transform of the whole box when the neighbourhoods would cost more). The
result is byte-identical to transforming the whole box; a test compares the
two (`strokeSelectionAlphaReference`). Inside and Outside need one distance
transform per tile, Center two.

Measured end to end in desktop Chrome and the Pixel 7 emulation on a
3000 × 4000 paint layer (local build, 2026-11-14), from clicking **Stroke**
to the notice: a ~750 × 950 px lasso with an 8 px Center stroke takes about
0.9 s, and a 20 px Center stroke of a (100,100)–(2900,3900) marquee about
1.9–2.1 s (it was 4.4–4.9 s before the tiled search). Most of the remaining
time is rendering the selection mask, reading the 12-megapixel layer and
committing the new pixels, not the band itself, which takes about 0.2 s and
0.5 s respectively in Node.

## Tests

`tests/stroke-selection.test.mjs`: option validation, exact distance
transform, band placement for each location on a rectangle, equal width on
straight, diagonal and curved edges, feathered (50 % edge) and compound
selections, canvas-edge and empty selections, malformed input, byte equality
of the tiled search with the whole-grid reference, and 3000 × 4000 timing
bounds. `tests/browser/stroke-selection.spec.ts` (desktop
and mobile): pixels on each side of a marquee edge for Inside/Center/Outside
with undo, colour, opacity and Multiply, remembered options, invalid input,
Cancel and Escape, a feathered Lasso plus Add, a subtracted hole surviving
reload, the disabled/empty-selection cases and the Select All + Outside
notice.
