# Edit → Fade contract

`Edit → Fade…` is a bounded local implementation of Photoshop's post-operation
opacity control. It is enabled only when the current history entry follows an
undoable edit on the same unlocked visible raster layer and the preceding frame
contains a matching raster asset. The dialog accepts 0–100 percent; 100 keeps
the current edit and 0 restores the previous raster state, with intermediate
values mixing all RGBA bytes deterministically.

Fade creates a new asset and history entry. Previous assets and both source
history frames remain unchanged, so Undo/Redo, local draft persistence and
portable project export retain the original edit and the faded result. Vector,
text, adjustment-only, smart-object, locked, mismatched-dimension and missing
history states remain guarded with a visible notice. This does not claim
Photoshop's full blend-mode, filter-specific or colour-managed Fade behavior.

Coverage includes pure endpoint/interpolation/validation and immutability tests,
plus desktop/mobile dialog, pixel-state, undo and project round-trip acceptance.
