# Path Selection and anchor-editing tools contract

PixelForge provides four Photoshop-style path editing tools next to the Pen
and Direct Selection tools. They edit the editable `path` layers and vector
masks described in [`path-tool-contract.md`](path-tool-contract.md) and
[`vector-mask-contract.md`](vector-mask-contract.md). They are bounded local
approximations; they do not claim Photoshop parity.

## Tools and toolbar placement

| Tool | Id | Shortcut | Toolbar slot |
| --- | --- | --- | --- |
| Path Selection | `path-select` | `A` (family) | Path Selection flyout (representative) |
| Direct Selection | `direct-select` | `A` (family) | Path Selection flyout |
| Add Anchor Point | `add-anchor` | none | Pen flyout |
| Delete Anchor Point | `delete-anchor` | none | Pen flyout |
| Convert Point | `convert-point` | none | Pen flyout |

- The Pen flyout lists, in order: Pen, Freeform Pen, Curvature Pen, Add
  Anchor Point, Delete Anchor Point, Convert Point. `P` still cycles only
  the three drawing pens, matching Photoshop, which gives the anchor tools no
  shortcut. Those tools show no shortcut badge in the slot or flyout.
- `A` cycles Path Selection → Direct Selection (Shift+A reverses). `A` used to
  be an alias for Direct Selection; from any other tool it now selects Path
  Selection first, and a second press reaches Direct Selection.
- Each tool has a unique canonical Lucide icon (`MousePointer`,
  `DiamondPlus`, `DiamondMinus`, `Diamond`), an accessible `<label> tool`
  button name, a tooltip, flyout entry, remembered family choice, toolbar
  reordering, draft tool-id persistence and the shared path Tool options
  section (saved path presets, Stroke Path with Brush).

## Targets and guards

All four tools act on the active layer: its vector mask path when it has one,
otherwise the layer itself when it is a path layer. Locked or hidden layers,
and layers without an editable path, are refused with a status message and no
history entry. Pointer positions are mapped through the inverse layer matrix,
so edits happen in the path's local coordinates; hit radii are divided by the
matrix scale to stay roughly constant on screen. Path Selection only selects
the active layer's path: clicking another layer's path does not switch layers.

## Behaviour

- **Path Selection** — a press on an anchor, on the stroke (10 px local
  tolerance) or inside any closed contour (by the path's fill rule, filled or
  not) selects the whole path and shows all anchors. Dragging translates every
  anchor and handle of every contour by the local pointer delta and commits
  one undo step on release; the layer matrix is unchanged. A press without a
  2-image-pixel drag commits nothing. Alt-drag duplication is not implemented.
- **Add Anchor Point** — a click on a segment inserts an anchor. Straight
  segments are split at the pointer's projection; cubic segments are split by
  de Casteljau at the sampled nearest parameter, preserving their shape.
  Clicking an existing anchor or empty space changes nothing.
- **Delete Anchor Point** — a click on an anchor removes it. A path always
  keeps one anchor, and a closed path with fewer than three anchors opens.
- **Convert Point** — a click on an anchor toggles corner ↔ smooth (the
  smooth handles follow the neighbouring tangent, as with Pen Shift-click).
  Dragging from an anchor pulls out symmetric handles: the outgoing handle
  follows the pointer and the incoming handle mirrors it. Dragging a handle
  moves that handle alone, leaving its sibling in place (a cusp). Each
  gesture is one undo step; Escape cancels an in-progress drag.
- **Pen modifiers** reuse the same helper (`src/pathEditTools.ts`): over the
  active path, a click on a segment adds an anchor, Shift-click converts and
  Alt/Option-click deletes. A click that edits nothing still starts a new path.

## Limits

Anchor insertion, deletion and conversion work on the primary contour (the
contour mirrored by `PathModel.nodes`); other contours of a compound path are
moved by Path Selection but not edited anchor-by-anchor. Curve hit testing
and interior tests sample each segment (16–48 samples) instead of solving it.
There is no multi-path selection, marquee path selection, path alignment or
combine-on-select. Edits round-trip through drafts and project files as plain
path data.

## Tests

- `tests/path-edit-tools.test.mjs` — translate, interior/whole-path hit
  tests, add/delete/convert edits, symmetric handle pulls, compound paths.
- `tests/tool-palette.test.mjs`, `tests/tool-icons.test.mjs`,
  `tests/sidebar-sections.test.mjs` — taxonomy, families, flyouts, icons.
- `tests/browser/path-edit-tools.spec.ts` (desktop and mobile) — flyouts,
  icons, `A`/`P` cycling, Path Selection drag deltas and undo on a path layer
  and a transformed vector mask, Add/Delete Anchor Point, Convert Point click
  and drag, and the Pen modifier edits.
