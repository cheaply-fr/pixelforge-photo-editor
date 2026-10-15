# Convert to Shape contract

`Type → Convert to Shape` is active for a visible, unlocked editable text
layer. PixelForge renders the current font, multiline layout, tracking,
orientation and bounded warp into an opaque alpha plane, traces that plane into
editable compound path contours, and replaces the text layer with a path layer
using the same layer identity, group, visibility, opacity and blend settings.
Undo restores the editable text source. The path and all contours persist in
local drafts and downloaded project files.

This is a local, source-preserving vectorization approximation. It uses a
thresholded axis-aligned pixel contour with collinear-anchor reduction and
bounded contour/node budgets; it does not claim font-outline fidelity,
OpenType shaping, Bézier fitting, variable-font interpolation, or semantic
re-editing of glyphs. The source text is retained in history for recovery, and
the UI discloses the conversion through its notice. Pure contour tests and
desktop/mobile tests cover representative alpha pixels, compound path metadata,
reload-safe export and undo recovery.
