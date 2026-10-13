# Editable text-on-path contract

**Type → Text on Path…** attaches a horizontal editable text layer to an
existing vector Pen path by layer ID. The text layer retains its own content,
font, colour, tracking and affine transform; the path remains a separate
editable layer. The command stores only a bounded `pathLayerId`, pixel offset
and direction flag in the versioned document, so moving or styling the path
continues to update the text without baking pixels.

Rendering flattens the first path contour into a bounded deterministic
polyline, maps it through the path and text transforms, and places each glyph
at its measured advance with the local tangent rotation. Text is clipped to
the available contour length, ignores newline separators for this bounded
mode, and supports reverse direction. Invalid IDs, missing path targets,
singular transforms and unsafe offsets fail closed. Vertical flow, arbitrary
mesh envelopes, OpenType shaping and Photoshop's full type-on-path baseline
options remain staged.

Pure coverage checks binding normalization, bounded offsets, straight-path
glyph positions, reverse direction and source immutability. Desktop/mobile
acceptance covers the Type menu command, representative editable rendering,
portable project round trip and reload persistence.
