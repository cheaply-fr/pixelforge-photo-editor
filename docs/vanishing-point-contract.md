# Vanishing Point contract

PixelForge exposes **Filter → Vanishing Point…** as a bounded, offline planar
projection for the active visible raster or embedded smart-object layer. The
command accepts four clockwise target corners in source-layer pixels and uses
the same validated RGBA homography and premultiplied-alpha sampling as the
local Perspective Warp implementation.

The operation creates a new editable raster asset and leaves the original
asset in the prior history frame. Undo, local draft recovery, project export
and project reload therefore restore the source without silently baking over
it. The command rejects missing, hidden or locked layers, malformed corners,
folded quads and out-of-bounds plans before committing a frame.

This is an explicit local approximation. It does not claim Photoshop's grid
authoring, multiple perspective planes, perspective-aware clone/heal tools,
automatic vanishing-point detection, or generative reconstruction. Those
capabilities require separate interaction, pixel-quality, privacy and resource
contracts.
