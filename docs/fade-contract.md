# Edit → Fade contract

`Edit → Fade…` is a bounded local implementation of Photoshop's post-operation
opacity control. It is enabled only when the current history entry follows an
undoable edit on the same unlocked visible raster layer and the preceding frame
contains a matching raster asset. The dialog accepts 0–100 percent; 100 keeps
the current edit and 0 restores the previous raster state, with intermediate
values mixing all RGBA bytes deterministically.

### Fade after a live filter

A live (non-destructive) filter leaves the raster asset unchanged, so mixing
assets would do nothing. When the last history step changed the active
layer's live filter (and not only its fade), Fade is enabled and stores the
chosen opacity as that filter's `fade` (0–100, integer;
`liveFilterFadeTarget` in `src/fade.ts`). The renderer mixes every RGBA
byte of the filter result with the filter's input at that opacity (`0` shows
the layer as it was before this filter, `100` removes the fade); it applies
to full-frame, band and stacked renders. The Filter effects panel then shows
a **Faded to (Edit → Fade)** slider. The fade is one undoable metadata step,
is dropped when another filter is chosen and is recorded in Actions. Fade is
disabled when the last step changed neither the raster asset nor the live
filter (for example after a previous Fade).

Raster Fade creates a new asset and history entry. Previous assets and both source
history frames remain unchanged, so Undo/Redo, local draft persistence and
portable project export retain the original edit and the faded result. Vector,
text, adjustment-only, smart-object, locked, mismatched-dimension and missing
history states remain guarded with a visible notice. This does not claim
Photoshop's full blend-mode, filter-specific or colour-managed Fade behavior.

Coverage includes pure endpoint/interpolation/validation and immutability tests,
plus desktop/mobile dialog, pixel-state, undo and project round-trip acceptance.
