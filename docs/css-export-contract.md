# Copy CSS contract

`Layer → Copy CSS` copies a deterministic standalone rule for the active
editable text or vector layer. It is a local clipboard operation and never
adds a history entry, uploads source pixels, or changes the draft.

Text exports include the editable box width, font family/size/weight, colour,
alignment, line-height, tracking, writing mode, opacity and the layer matrix.
The original text is retained in a `--pixelforge-text` custom property so a
consumer can choose its own HTML content safely.

Rectangle, ellipse, line, polygon and path exports include bounded dimensions,
fill/stroke colours, opacity, transform and a CSS `clip-path` where the shape
has a fill. Compound paths keep their validated path data. Raster, smart-object
and adjustment layers are rejected because converting their local source pixels
to CSS would silently flatten or expose data.

CSS support is intentionally a handoff format. It does not claim Photoshop
document, font embedding, text shaping, raster or vector-stroke parity. Pure
serialization and invalid-input coverage lives in `tests/css-export.test.mjs`;
the desktop/mobile menu and clipboard workflow is covered by
`tests/browser/copy-css.spec.ts`.

