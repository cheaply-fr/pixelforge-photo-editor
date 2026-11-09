# Layers panel interaction contract

The Layers panel lists the stack top-first (the top row is the top of the
stack; `Frame.layers` stays bottom-to-top). It offers direct reordering,
deletion and a per-row menu. These are bounded local behaviours that follow
Photoshop's conventions where noted; they are not a claim of Photoshop parity.
Pure planning lives in `src/layerDragReorder.ts`; the panel UI is
`src/LayersPanel.tsx`.

## Row anatomy

Each layer row is a drag handle (grip), the existing "Select layer <name>"
button, a trash button ("Delete <name>") and a "Layer options for <name>"
(⋯) button. On desktop the trash and ⋯ buttons appear on hover or keyboard
focus (they stay in the tab order); on touch layouts (`hover: none` or
`pointer: coarse`) they are always visible with 30 px targets (26 px on
desktop). Rows never overflow horizontally at 375 px; clipped rows keep the
`↳` indent from the clipping contract.

Raster rows show a small thumbnail of the layer's own pixels placed in the
document (`src/layerThumbnails.ts`, `src/LayerThumbnail.tsx`) in the 28 px
slot that other kinds use for their type glyph. It is decorative (empty
`alt`): the row's accessible name stays "Select layer <name>". Thumbnails are
drawn straight from the stored asset (a tiled layer decodes each non-empty
tile at its reduced size), never through the full renderer, so they ignore
styles, filters, masks and blend modes. A row draws one only while it is on
screen and its layer has not changed for 300 ms, one layer at a time, and
keeps the previous image meanwhile; results are keyed by asset content,
transform and fill colour and kept in a 256-entry memory cache. Nothing is
stored in drafts or projects.

Every row's accessible description gives its stack position counted from the
top, e.g. "layer 4 of 9, above Paint 2" ("bottom of the stack" for the lowest
layer). Clipped rows prefix it with "Clipped to <base>; ".

## Drag and drop

- **Mouse/pen:** press anywhere on a row (not its trash/⋯ buttons) and move
  5 px to start. **Touch:** long-press the grip handle (300 ms) and drag; the
  handle has `touch-action: none`, so the list still scrolls normally from
  the rest of the row. Escape (or a pointer cancel) cancels with no change.
- While dragging, the target row shows an insertion line above or below it
  (a layer row's upper / lower half), and a hint near the pointer names the
  drop: "Drop above Paint 2", "Drop below Paint 2", "Drop into folder
  Group 1", "Drop into clipping group of Base", "Drop above the clipping group
  (cannot join it)", or a refusal ("Locked layers cannot be moved", "Locked
  folders cannot be changed"). Refusals show a red line. The list auto-scrolls
  while the pointer is within 28 px of its top or bottom edge.
- Dragging a selected row moves the whole selection, in stack order, as one
  block (rows need not be contiguous). Dragging an unselected row moves only
  that row and selects it afterwards.
- **Folders:** the lower two thirds of a folder header drops into the folder
  (at the top of its members); its upper third drops above the folder.
  Dropping next to a folder member puts the layer into that folder at that
  position; dropping next to a layer outside any folder takes it out. A folder
  emptied by a drag is removed. A folder dragged by its header (or its grip)
  moves as one block and never nests: a drop inside another folder lands
  beside that folder.
- **Clipping groups** (see `clipping-mask-contract.md`): dragging a base
  carries its clipped layers. Dropping a layer between a base and its clipped
  layers **joins the group as clipped** when every moved layer is a raster or
  smart object and none is itself a base carrying clipped layers; otherwise the
  drop is redirected directly above the group. Dragging a clipped layer out of
  its group releases only that layer and the status names it.
- **Locks:** locked layers, layers in locked folders, locked folders and drops
  into a locked folder are refused with a status.
- Each successful drop is **one undo step**. The status line reads "Layer
  reordered…" / "N layers reordered…" (or the folder/clipping variant), and the
  panel's live region announces the result, e.g. "Paint 3 moved above Paint 2,
  4 of 9". History frames do not store command names (see
  `history-timeline-contract.md`), so the History panel labels the step by the
  active layer like every other step.

## Keyboard

With a layer row focused:

| Keys | Action |
| --- | --- |
| Ctrl/Cmd+] or Alt+↑ | Bring Forward |
| Ctrl/Cmd+[ or Alt+↓ | Send Backward |
| Ctrl/Cmd+Shift+] or Alt+Shift+↑ | Bring to Front |
| Ctrl/Cmd+Shift+[ or Alt+Shift+↓ | Send to Back |
| ↑ / ↓ | Focus the row above / below |
| Delete or Backspace | Delete the row (or the selection it belongs to) |
| ContextMenu or Shift+F10 | Open the row menu |

Ctrl/Cmd+brackets also work globally (canvas focused) on the current
selection. Arrange keys reuse Layer Arrange (`layer-arrange-contract.md`),
keep focus on the moved row and announce the new position; a move at the
stack boundary announces "Already at that end of the stack".

## Delete

The row trash button, Delete/Backspace on a focused row, the row menu, the
inspector's "Delete layer" button and Layer > Delete share one planner
(`planLayerDelete`):

- It deletes the selection when the row is part of it, otherwise only that
  row; a multi-selection is deleted in one undo step.
- Locked layers (or layers in locked folders) and deleting the last remaining
  layer are refused with a status ("Unlock all selected layers before
  deleting", "Keep at least one layer in the document").
- Selection follows Photoshop: the layer directly below the lowest deleted
  layer becomes the active, only selected layer (the lowest remaining layer
  when nothing is below). If the active layer survives, it stays active.
  Focus moves to that row.
- Clipping: deleting a clipped member re-points the clipped layer above it to
  the next surviving member (the group keeps its base); deleting a base
  releases its lowest clipped layer, which becomes the base for the clipped
  layers above it. Emptied folders are removed and artboard membership is
  cleaned.

## Row menu

Right-click a row (desktop), long-press a row (touch, 550 ms), press the ⋯
button, or press ContextMenu / Shift+F10. Items: Duplicate, Delete, Bring to
Front, Bring Forward, Send Backward, Send to Back, Create / Release Clipping
Mask, Group into Folder, Rename…, Hide / Show, Lock / Unlock. Disabled items
reflect the same planners as the menu bar. Items act on the selection when it
includes the row, otherwise on the row alone. Arrow keys, Home and End move
between items; Escape closes and returns focus to the trigger; a press outside
closes it.

## Files dropped on the editor

- With a document open, browser-decodable image files dropped on the canvas
  become raster layers (bounded local Place Embedded): each is centred at the
  drop point (clamped to the document; the document centre when dropped
  outside the canvas), inserted directly above the selected layer following
  `layerInsertion.ts`, in drop order (the last file on top), all in **one undo
  step**. The 64 MB per-file limit, layer limit and pixel/asset budgets of the
  import path apply.
- Files dropped on the Layers panel show the same insertion line ("Add above
  Paint 2", "Add into folder Group 1") and are inserted at that position,
  centred in the document; the new layers become the selection.
- With no document open, or with Shift held, the first file opens as a new
  document as before. `.pixelforge` / JSON projects open as projects, and
  PSD/PSB files open as a flattened document as before.
- Unsupported files get a status ("notes.txt cannot be added as a layer…");
  mixed drops add the images and report how many files were skipped.
- While dragging files the editor shows an overlay: "Drop to add as layer"
  (with a hint to hold Shift) or "Drop to open".
- Mobile browsers have no file drag and drop; "Add image layer" in the Layers
  panel and File > Open cover the same imports.

## Tests

`tests/layer-drag-reorder.test.mjs` covers pointer zones, single and
multi-layer drops, no-op/self/missing refusals, locks, folder in/out/header
zones, folder blocks that never nest, clipping-group units, joining and
redirecting, releases, delete selection-follow and clipping rules, artboard
cleanup, position descriptions, move announcements, drop placement and file
classification. `tests/browser/layers-panel-reorder.spec.ts` covers mouse drag
with an insertion line and a stacking pixel check, Escape cancel, multi-select
drags, folder in/out, clipping-group drags, locked refusals, the row menu
(right-click and ⋯), keyboard reorder with the live announcement, row delete
with the Delete key, undo/redo and refusals, reload persistence, touch
long-press drag and menu on the mobile profile, compact layout, and synthetic
file drops on the canvas and the panel (single, multiple, unsupported,
Shift-drop).
