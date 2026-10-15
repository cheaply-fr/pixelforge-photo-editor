# Undo history purge contract

`Edit → Purge Undo History…` is an explicit local memory-control action. The
confirmation dialog keeps the current frame and clears all earlier undo and
redo snapshots; it does not flatten layers, remove assets, alter the document
name, or delete the local draft. The retained frame is validated through the
normal `commit(..., replace=true)` boundary, so the current document remains
editable and project export contains one valid history entry.

The command is disabled when no prior snapshot exists or while Quick Mask is
active. Pure tests cover immutable planning and invalid indexes. Desktop/mobile
acceptance covers confirmation, disabled Undo state, current dimensions, and a
portable project round trip. Purging is irreversible for the discarded history
states; the explicit confirmation is required before it runs.
