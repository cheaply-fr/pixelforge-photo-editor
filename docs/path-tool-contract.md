# Pen and Path layer contract

PixelForge stores editable `path` layers. Each local-coordinate anchor can
optionally carry incoming and outgoing cubic Bézier handles, a `closed` flag,
and independent fill/stroke appearance metadata. Existing straight-segment
paths omit handles and remain byte-compatible. The layer affine matrix remains
separate from the nodes, so moving, scaling, rotating, and flipping the layer
does not bake geometry into pixels.

The Pen (`P`) places one node per click. Holding **Shift** while dragging a
point creates an outgoing cubic handle; holding **Alt** mirrors it to the
incoming side. Clicking the first node after at least three nodes closes and
commits a path layer. Escape or a pointer cancel clears an in-progress path
without changing document history. Closed paths render a filled interior and
optional rounded stroke; open paths render their segments as a stroke. Cubic
extrema are included in bounds, hit-testing samples curve segments, and SVG
serialization emits deterministic `C` commands.

The Freeform Pen samples a bounded pointer stroke, removes sub-pixel jitter and
derives neighbouring tangent handles for an open editable cubic path. The
Curvature Pen uses Photoshop-style click-to-place anchors: each new point is
smoothed from its neighbours, and clicking the first point after three anchors
commits a closed filled path. Both tools preserve the original anchors and
handles for Direct Selection, reject malformed or overlong input, and cancel
without a history entry on Escape or pointer cancellation.

Path Selection, Add/Delete Anchor Point and Convert Point are specified in
[`path-edit-tools-contract.md`](path-edit-tools-contract.md).

Direct Selection (`A`, after Path Selection) selects a node on the active visible, unlocked path and
drags it in local coordinates through the layer matrix. A drag commits one
history entry and therefore participates in undo/redo. Locked and hidden paths
reject node edits. The Layers panel exposes path closure, fill/stroke toggles,
colors, stroke width, and the node count.

When the Pen is active on an existing visible, unlocked path, a click on its
stroke splits the nearest bounded segment and inserts an editable anchor. The
split preserves cubic Bézier geometry through a deterministic de Casteljau
step. Shift-clicking an anchor toggles a mirrored smooth point and Alt/Option-
clicking removes it; removing an anchor never leaves an invalid empty path and
automatically opens a path that no longer has enough nodes for a closed loop.
These edits are immutable, undoable, and round-trip through local drafts and
project files. The bounded Layer → Combine Shapes commands described below
consume this same path model; semantic object inference and open/mixed operands
remain outside this local geometry contract.

Path metadata is validated on draft import and project export. Node coordinates
and style values are bounded to keep malformed or oversized project files from
allocating unbounded work. Compound paths preserve the legacy `nodes` and
`closed` fields as a mirror of their first contour and add at most 64 validated
contours with a shared `fillRule`. Older single-contour drafts therefore remain
readable and render with the `nonzero` default, while boolean results use
`evenodd` so subtraction holes and disjoint components render without baking
pixels. Arrangement splitting also cuts self-intersections before tracing, so
valid even-odd paths do not leave dangling edges.

Layer → Combine Shapes now accepts two to eight visible, unlocked, closed path
or parametric rectangle/ellipse/polygon layers in one group (or at the document
root). Parent folders must also be visible. Union, Subtract Front Shape,
Intersect and Exclude split bounded line arrangements, including self-crossings,
preserve every resulting contour, and replace the selected layers
with one editable path at the original stack position. Open paths, raster/text
layers, mixed groups, oversized edge sets and empty intersections are rejected
without a history entry. The operation is local and nondestructive to source
assets; undo, draft reload and project export retain the resulting contours.
Pure geometry tests cover overlap, disjoint components, holes, malformed
operands and deterministic flattening. Desktop and mobile acceptance tests
cover all four commands, disabled open-path guards and a reload round trip.

Raster export uses the same affine, opacity, blend, and adjustment pipeline as
other editable layers.

## Pen options

Pen-family options persist in the draft as `settings.penOptions`
(`src/penOptions.ts`); missing keys load the defaults so older drafts work.
They are bounded local approximations of Photoshop's options.

- **Pen mode** (Pen, Freeform Pen, Curvature Pen): **Shape** (default) keeps
  the behaviour above — closing fills the path in the foreground colour with a
  Size/3 outline. **Path** creates an unfilled **work path** layer named
  "Work Path N" with a 1 px foreground hairline so it stays visible and
  selectable; use Stroke Path or the Layers panel fill/stroke settings to give it
  paint. There is no separate Paths panel.
- **Auto Add/Delete** (Pen, default on): an unmodified Pen press on the active
  visible, unlocked path deletes the anchor under the pointer or adds one on a
  segment; Alt/Option still deletes and Shift still converts. Off, an
  unmodified press always starts a new path.
- **Rubber Band** (Pen and Curvature Pen, default off): while placing anchors
  and no button is held, the preview includes the next segment (or smooth
  curve) from the last anchor to the pointer. Touch input has no hover, so it
  only applies to mouse and hovering pens.
- A closed **Curvature Pen** path takes every anchor's tangent from its cyclic
  neighbours, so the closing segment is curved like the others (it used to stay
  straight). Open curvature paths are unchanged.
- Tool options are tailored per tool: Pen shows Mode, Size (Shape mode), Auto
  Add/Delete and Rubber Band; Curvature Pen shows Mode, Size and Rubber Band;
  Freeform Pen shows Mode and Size; Add/Delete Anchor Point, Convert Point,
  Path Selection and Direct Selection show only a one-line hint plus the saved
  path presets and Stroke Path. Every pen/path tool shows a hint.

Evidence: `tests/audit-vector.test.mjs` and
`tests/browser/audit-vector-pen.spec.ts` (desktop and mobile).
