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

## Document export (File → Export as SVG)

The Export dialog's **SVG — layered vectors** format (also File → Export as
SVG) writes the whole document, or the selected artboard, as one SVG file
(`src/svgDocumentExport.ts`):

- Rectangle, ellipse, line, polygon/star and path layers become native SVG
  elements (`rect`, `ellipse`, `line`, `polygon`, `path`) that match the canvas
  renderer's geometry, stroke joins/caps and miter limits. Layer transform,
  opacity, name (`data-name`) and blend mode (CSS `mix-blend-mode`) are kept.
- Text layers become SVG `text`, laid out with the same engine as the canvas
  (wrapping, alignment, line height, letter spacing, rich runs, underline and
  strikethrough). Lines that share an alignment edge use `text-anchor`, so the
  text stays editable and aligned in other apps. Fonts are referenced by
  family name and are not embedded.
- Layer groups become `g` elements with their name and opacity.
- Pixel layers, and any layer with a mask, layer style, adjustment, smart
  filter or cleanup edit, are embedded as PNG images cropped to their visible
  pixels, in their place in the stack.
- Adjustment layers, clipping masks and blend modes CSS lacks change pixels
  below them, so everything up to the topmost such layer is flattened into one
  base image. Hidden layers and members of hidden groups are omitted.

The exported file passes the import safety check, and reopening it gives back
the same vector, text and pixel layers. `tests/svg-document-export.test.mjs`
covers layer modes, flattening, element geometry, text markup, grouping and the
import round trip; `tests/browser/svg-support.spec.ts` (desktop and mobile)
checks the downloaded file, its round trip, and that the browser's render of
the exported SVG matches the editor's PNG export (mean channel difference
under 1.5/255), text included.
