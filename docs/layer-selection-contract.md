# Multi-layer selection contract

Pixel keeps layer selection separate from the active edit anchor. A frame may
include `selectedLayerIds`, an ordered, bounded list of existing layer ids. The
field is optional for compatibility with v1 drafts: a missing field is
normalized to the active layer at the draft boundary. An explicit empty list
means that no layer is selected and is preserved through local reload and
private-project round trips. The active layer remains the edit anchor for
commands that operate on one layer.

## Selection gestures and commands

- A normal layer-row click replaces the selection and makes that layer active.
- Picking from the canvas (`src/layerPick.ts`) selects the topmost layer with
  a non-transparent pixel under the pointer: visible, above 0% opacity, in a
  visible folder, not an adjustment layer; a clipped layer counts only where
  its clipping base has pixels and a layer mask hides what it masks. With the
  Move tool, the "Auto-select layer" option (off by default, not saved with
  the document) picks on every press before the move starts, and right-click
  or a touch long-press on the canvas picks without moving. Each layer is
  sampled at one pixel: a paint layer decodes only the tile under the point,
  other kinds render alone into a 1 × 1 frame. A point over no pixels keeps
  the selection and says so in the status bar.
- Shift-click selects the inclusive stack-order range from the active anchor
  to the clicked row. Ctrl-click on Windows/Linux and Cmd-click on macOS toggle
  one layer without losing the other selected ids.
- Selection ids are de-duplicated, limited by `MAX_SELECTED_LAYERS`, and
  canonicalized to the current layer order. Deleted or unknown ids are dropped
  during validation and migration.
- `Select > All Layers` selects every layer while retaining the current active
  anchor; `Select > Deselect Layers` writes an explicit empty list; and
  `Select > Isolate Layers` changes only visibility, leaving selection metadata
  intact.

## Multi-layer operations

Duplicate, delete and group operate on the selected set as one undoable
command. They reject locked members, preserve stable stack order, and retain a
valid active anchor. Align commands translate every selected unlocked layer by
the same delta, using the combined painted bounds as the selection bounds;
source assets, masks, transforms other than translation, and metadata remain
editable. Existing single-layer alignment remains available after an explicit
deselection. Merge, clipping, vector masks, links, smart objects and
distribution of an arbitrary multi-selection remain separate contracts.

## Safety and privacy

Selection changes do not upload pixels and do not create history entries. A
mutating multi-layer command creates one history entry, is undoable/redoable,
and preserves hidden, unselected layers. Locked layers are never modified.
Malformed, duplicated, over-limit or unknown ids fail closed at the document
boundary. Anonymous editing remains free and local-first; authenticated
selection metadata can travel with an optional private project only.

## Evidence gate

The pure suite covers legacy normalization, explicit deselection, id validation,
toggle/range gestures, combined bounds and translation math. Desktop and mobile
browser acceptance covers Shift/Ctrl selection, reload/project persistence,
Select-menu commands, duplicate/group/delete, isolate visibility and undo.
Typecheck, lint, production build, full pure tests, protected CI and a fresh
live-revision smoke check are required before enabling this slice in production.
