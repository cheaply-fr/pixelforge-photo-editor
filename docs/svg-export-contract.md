# SVG export contract

`Layer → Copy SVG` is active for editable path, rectangle, ellipse and polygon
layers. PixelForge converts parametric shapes to the same transformed path
model used by Combine Shapes, serializes deterministic SVG path data with the
layer's fill, stroke, width and even-odd rule, and writes a standalone SVG to
the browser clipboard. The document and history remain unchanged; if the async
clipboard API is unavailable, the command fails visibly without changing the
draft.

Text, raster, adjustment and smart-object layers are intentionally rejected.
The export preserves editable vector geometry but does not embed fonts, layer
styles, masks, clipping relationships or a Photoshop document graph. Pure
serialization tests and desktop/mobile clipboard acceptance cover deterministic
path data, transformed geometry, unsupported-layer guards and no-history-change
behavior.
