# Editable Warp Text contract

Text layers retain their source string and typography metadata while an optional
bounded `warp` object changes raster placement at render time. `style` is one of
`none`, `arc`, `bulge`, or `flag`; bend and vertical distortion are clamped to
`-100..100`. The renderer applies deterministic per-glyph transforms, so undo,
reload, export, and local draft persistence reproduce the same result without
rasterizing the text. Legacy text layers omit `warp` and remain unchanged.

The current UI exposes this through Type → Warp Text…, an in-app dialog with
a style list and bend / vertical distortion fields validated to −100…100. Full Photoshop mesh warps, font deformation,
OpenType shaping, and arbitrary bezier envelopes remain future work.
