# Brush flow contract

Brush, Pencil and Eraser expose a persisted **Flow** amount from 1 to 100%.
Flow scales the opacity supplied to each local brush dab independently of the
user's overall Opacity setting. The source raster remains immutable until the
pointer-up commit, so one gesture remains undoable and replayable.

Flow defaults to 100% for older drafts, is bounded by project validation, and
has desktop/mobile acceptance for accessible UI and portable project
round-trips. Pressure opacity and the deterministic Texture amount remain
separate controls; this does not claim Photoshop's full wet-media buildup.
