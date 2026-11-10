# Shape tools contract (U family)

The U family holds six editable vector shape tools, in Photoshop's classic
order: **Rectangle** (labelled "Shape"), **Rounded Rectangle**, **Ellipse**,
**Line**, **Polygon** and **Custom Shape**. Existing tool ids are unchanged;
`rounded-rectangle` and `custom-shape` were added. U cycles forward through
the family and Shift+U backward. The toolbar keeps one representative slot
for the family; every subtool has a unique canonical Lucide icon
(`SquareRoundCorner`, `Shapes`), an accessible "<label> tool" name and a
flyout entry, on desktop and mobile. Both new tools open the Tool options
sidebar section.

These are bounded local approximations of Photoshop's shape tools. They do
not import Photoshop `.csh` shape libraries, live-shape properties panels,
path operations on draw or stroke alignment, and PixelForge does not claim
Photoshop parity.

## Rounded Rectangle

- Rectangle layers carry an optional `cornerRadius` in local pixels
  (0–8,000). A missing value is 0, so older drafts and projects render square
  exactly as before. Malformed values (negative, non-finite, non-number or
  over the bound) make the document invalid on load.
- The radius is clamped at render time to half the shorter side
  (`clampCornerRadius`), so an oversized radius draws a stadium or circle; the
  stored value is preserved for later resizing.
- Corners are four cubic quarter-circle arcs (`roundedRectNodes`,
  κ = 0.5523). The same geometry is used by the canvas and worker renderers
  (both go through `renderFrame`), and therefore by PNG/JPEG/WebP export and
  the flattened PSD/PDF export; Copy CSS emits a cubic `clip-path`; Copy SVG
  emits cubic corners. Path booleans (Combine Shapes) use a 12-segment
  flattened polygon per corner (`roundedRectPoints`).
- The tool uses the shared Fill / Stroke options below (default: filled in
  the foreground colour, no stroke). Tool options also expose a Corner radius
  slider (0–500 px, persisted as `shapeCornerRadius`).
  Layer properties expose an editable Corner radius field for every
  rectangle layer, including ones drawn with the Rectangle tool.
- Shift constrains the drag to a square; Alt/Option draws from the centre.

## Custom Shape

- `src/customShapeLibrary.ts` holds 15 built-in shapes: Arrow, Heart,
  Starburst, Speech Bubble, Checkmark, Cross, Plus, Lightning, Flower (with an
  even-odd centre hole), Puzzle Piece, Drop, Cloud, House, Chevron and Ribbon.
  Each is authored as an M/L/C/Z command list and normalized so the hull of
  its anchors and handles spans exactly the unit box; scaled shapes therefore
  never draw outside the dragged box.
- Tool options show the library as a radio group of SVG thumbnails (a
  `radiogroup` named "Custom shape" of native radio inputs with accessible
  names and a checked state, 36 px targets, 44 px on mobile). When
  the user has saved Pen path presets, a "Saved path as custom shape" select
  can use a closed saved path instead; it is fitted to the drag box.
- Dragging creates an ordinary editable **path layer** (fill and stroke from
  the shared options below, local nodes, translation matrix) named after the
  shape.
  Direct Selection, Copy SVG/CSS, vector masks, booleans and Stroke Path work
  on it like any path layer. Shift keeps the shape's designed proportions;
  Alt/Option draws from the centre.
- The chosen shape persists as `customShapeId` (a library id or
  `path-preset:<id>`); unknown values are rejected by draft validation and a
  missing preset falls back to the default heart.

## Evidence

- Pure: `tests/shape-tools.test.mjs` — radius clamping and validation,
  quarter-arc accuracy, flattened points, drag-box Shift/Alt maths, frame and
  draft validation/back-compat, CSS/SVG serialization, every library shape
  closed + normalized + `validatePath` + exact scaling, parser rejection,
  saved-path fitting, U-family order, icons and sidebar section.
- Browser (desktop and mobile): `tests/browser/shape-tools.spec.ts` — rounded
  corner pixel transparent and interior/edge filled, Layer properties radius
  edit with undo, reload persistence of the layer radius and tool option,
  Shift square with clamped oversized radius, Custom Shape path layer bounds
  and fill pixels, undo removes it, Shift aspect and Alt centring, U cycling
  and flyout entries.

## Shared Fill / Stroke options

All six U-family tools share one set of Tool options, persisted in the draft
as `settings.shapeAppearance` (`src/shapeAppearance.ts`). Missing keys load
the defaults, so older drafts keep working; malformed values reject the draft
like other settings.

- **Fill**: Foreground colour (default), Background colour, Custom colour or
  None. **Stroke**: None (default), Foreground, Background or Custom colour.
  **Stroke width**: 1–100 px (default 4). The brush Size slider is not shown
  for shape tools; the old "stroke = Size/3" rule is gone.
- Default: **filled with the foreground colour, no stroke** for Rectangle,
  Rounded Rectangle, Ellipse, Polygon and Custom Shape alike. Previously
  Rectangle, Ellipse and Polygon drew outlines while Rounded Rectangle and
  Custom Shape filled; all tools now behave the same.
- Fill None + Stroke draws an outline-only shape; Fill + Stroke draws both.
  Fill None + Stroke None draws nothing and the status bar says so.
- Line has no interior: it uses the Stroke colour (the foreground colour when
  Stroke is None) at the Stroke width.
- **W×H create**: "New" width × height (1–16,000 px, default 200 × 200) and
  **Create** add a shape of exactly that size centred on the canvas as one
  undoable step.
- Every shape tool previews the real layer (fill, stroke and width) while
  dragging. Shift constrains proportions and Alt/Option draws from the centre
  for every tool except Line.

Parametric rectangle, ellipse and polygon layers keep `fill` + `color` +
`stroke` (width) and gain an optional `strokeColor` (`#rrggbb`). When present,
an outline is drawn in it on top of any fill; when absent, an unfilled shape is
outlined in `color` exactly as older drafts were, and a filled shape has no
outline. `strokeColor` is rejected on line layers. Layer properties expose a
**Layer stroke** toggle, colour and width for filled shapes. Copy SVG, Copy
CSS, Combine Shapes and canvas bounds use the same rule (a filled shape
without `strokeColor` now exports no border/stroke, matching the canvas).

Layers are named after their tool: "Rectangle N", "Rounded Rectangle N",
"Ellipse N", "Line N", "Polygon N", or the custom shape's name, and the status
bar reports "<name> added".

Evidence: `tests/audit-vector.test.mjs` (defaults, resolution, validation,
naming, centring, draft round-trip) and
`tests/browser/audit-vector-shapes.spec.ts` (desktop and mobile: filled
defaults and names, fill/stroke rendering and reload persistence, W×H create
with undo, Layer stroke edit, custom shape radio group).
