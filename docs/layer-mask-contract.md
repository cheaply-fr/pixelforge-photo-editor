# Raster layer-mask contract

Pixel stores a raster layer mask as a canvas-sized alpha asset referenced by
the editable layer. The source raster asset remains immutable; rendering
multiplies its alpha by the mask alpha while leaving source RGB bytes intact.
Legacy documents without mask controls behave as enabled, non-inverted masks.

Each masked raster layer may carry these optional fields:

| Field | Valid values | Meaning |
| --- | --- | --- |
| `mask` | an asset ID whose dimensions equal the frame | Canvas-sized alpha asset. |
| `maskEnabled` | boolean; omitted means `true` | When `false`, rendering bypasses the mask without deleting it. |
| `maskInverted` | boolean; omitted means `false` | When `true`, each mask alpha is complemented (`255 - alpha`) before composition. |

The editor exposes the contract through the Layer menu and layer panel:
create a mask from the current selection, invert it, disable or re-enable it,
and remove it. Inversion and enabled state are metadata-only edits. Removing a
mask drops the reference and its control fields but retains the immutable
source pixels. Locked, hidden, non-raster and maskless layers reject edits with
an accessible notice. Every accepted command creates one undoable history
state; no-op commands do not add history.

Creating a mask from the selection consumes the selection, as Photoshop
does: the same single history state adds the mask and deselects, keeping the
selection as the Select > Reselect snapshot (`previousSelection`). Painting
the new mask with Mask Brush, Mask Eraser or Adjustment Brush is therefore
not confined by the old selection; undo restores both the maskless layer and
the selection.

Mask assets are validated during document import, migration, resize, crop,
rotate, local draft save and private cloud save. A missing asset, mismatched
dimensions, non-boolean control or control without a mask reference rejects
the document before it replaces the current editor state. Canvas transforms
regenerate the mask asset with the same integer translation/resize contract as
the frame, preserving source and mask editability.

Acceptance evidence includes pure alpha/inversion/validation tests, desktop
and mobile Layer-menu tests, locked/hidden/non-raster guards, undo/redo,
reload/project round trips and a representative source-pixel immutability
assertion. The release gate for the current milestone records 6 mask pure
tests and 12 desktop/mobile browser runs.
