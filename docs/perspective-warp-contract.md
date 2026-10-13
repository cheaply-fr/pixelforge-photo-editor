# Perspective Warp contract

`Edit → Perspective Warp…` applies a bounded local raster warp to the active
visible, unlocked raster or smart-object layer. The user supplies four
clockwise convex target points in that layer's pixel space. PixelForge maps the
layer rectangle into that quadrilateral, writes a fresh same-sized RGBA asset,
and keeps the original asset in the prior history frame for undo.

The operation preserves editable layer identity, project/reload behavior and
source assets. Pixels outside the target quadrilateral become transparent;
nearest-neighbour sampling is used for deterministic bounded output. This is a
local raster approximation, not Photoshop's mesh-based Perspective Warp,
content-aware fill, or subpixel color-management implementation.

Pure tests cover identity geometry, convex target mapping, source immutability
and malformed quads. Desktop/mobile acceptance covers the menu command, pixel
replacement, source-asset retention and reload persistence.
