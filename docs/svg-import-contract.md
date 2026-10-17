# SVG import contract

PixelForge accepts a bounded, local-only SVG subset for flattened raster
import. The source is converted into an editable raster layer or smart-object
asset; vector paths, embedded fonts, external resources and source metadata
are deliberately not retained. The editable `.pixelforge` project remains the
recovery format.

Before a browser image decoder sees the source, PixelForge validates UTF-8
markup, an explicit pixel `width`/`height` or `viewBox`, a 16,000-pixel maximum
dimension, a 16-megapixel maximum viewport and an 8 MB source limit. The
element count is capped at 20,000. Document declarations, scripts,
`foreignObject`, plugin/media elements, event-handler attributes, stylesheet
imports, source URLs and non-fragment `href`/`url()` references are rejected.
Local fragment references such as `url(#paint)` remain available for ordinary
gradients and reusable definitions.

The sanitized markup is placed in a fresh object URL and rasterized locally.
No fetch or network request is used for an SVG import. Invalid or unsafe input
leaves the active draft unchanged and provides a conversion/safety message.
Batch image export uses the same sanitizer and reports unsafe files
individually while preserving valid outputs.

This is a security and bounded-rasterization contract, not a claim of SVG
editing, animation, CSS/layout, font, filter, external-asset or lossless
vector interoperability. Those capabilities remain separately staged.

## Acceptance evidence

Pure tests cover UTF-8 decoding, dimensions/viewBox bounds, element limits,
duplicate attributes, local fragment references and unsafe document/resource
patterns. Desktop and mobile browser tests cover safe SVG pixel import, draft
preservation for unsafe references, no external request before rejection and
mixed-result batch export.
