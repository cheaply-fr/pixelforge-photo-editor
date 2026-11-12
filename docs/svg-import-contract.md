# SVG import contract

PixelForge opens SVG files as editable layers. Open, Place and drag-and-drop
all use the same path (`src/svgImport.ts`, `src/svgImportLayers.ts`):

- `path`, `rect` (including rounded corners), `circle`, `ellipse`, `line`,
  `polyline` and `polygon` become **editable path layers**. Every path command
  is supported, including relative forms, smooth curves, quadratics (stored as
  cubics) and arcs (split into cubics). Fill and stroke colours (named, hex,
  `rgb()`, `hsl()`, `currentColor`), fill/stroke opacity, stroke width, the
  even-odd fill rule, stroke joins and caps, element opacity and CSS
  `mix-blend-mode` are kept. Rotations, translations and uniform scales are
  baked into the path nodes so the Pen tools edit document coordinates; skews
  and non-uniform scales stay on the layer transform.
- Simple `text` (one style, horizontal lines from `tspan` rows with an equal
  line gap) becomes a **text layer** with font family, size, weight, colour,
  letter spacing, line height and `text-anchor` alignment. The anchor is
  honoured by measuring the laid-out text.
- A top-level `g` becomes a **layer group** with its name (`inkscape:label`,
  `data-name` or `id`) and opacity. Nested groups fold their opacity into their
  members. Placing an SVG into an open document puts its layers in the active
  layer's folder, so group opacity is folded into each placed layer.
- Local stylesheets (`<style>` with tag, `.class`, `#id` and compound
  selectors, applied by specificity), `style` attributes and presentation
  attributes are all honoured. Absolute units (`pt`, `pc`, `mm`, `cm`, `in`)
  convert to pixels, and `viewBox` with `preserveAspectRatio` maps to the
  document size.

Anything the converter cannot reproduce exactly is kept as a **pixel layer** in
its place in the stack: gradients, patterns, clip paths, masks, filters,
markers, dashed strokes, `use`, embedded images, nested `svg`, styled text runs,
italic or decorated text and text on a path. The piece is rasterized by the
browser's own SVG renderer from a standalone document that carries the
stylesheet and every definition it references, so it looks the same as in the
source file. Consecutive pieces share one pixel layer. A file that would need
more than the 512-layer document limit imports as one flattened layer.

## Safety

Before any parsing or rendering, `src/svg.ts` validates UTF-8 markup, an
explicit absolute `width`/`height` or a `viewBox` (percentage sizes need a
`viewBox`), a 16,000-pixel maximum dimension, a 16-megapixel maximum viewport
and an 8 MB source limit. The element count is capped at 20,000. Rejected:
DOCTYPE internal subsets and entity declarations, scripts, `foreignObject`,
plugin/media elements, `link`, event-handler attributes, `javascript:` URLs,
`src` attributes, stylesheet `@import`/`@font-face`/`expression()`, and any
`href`/`url()` that is not a local `#fragment`. A plain DOCTYPE (as Illustrator
writes) is allowed. Embedded raster images are allowed only as base64 PNG,
JPEG, GIF or WebP data URLs. No fetch or network request is used for an SVG
import, and invalid or unsafe input leaves the active draft unchanged.

Embedded smart objects (Place Embedded) still use the flattened SVG raster
path.

## Limits

This is not full SVG editing parity: animation, CSS layout, `@font-face`
fonts, filters and gradients do not become editable, and text uses fonts
available in the browser. Unsupported pieces stay visually faithful as pixel
layers rather than being dropped.

## Acceptance evidence

`tests/svg-import-layers.test.mjs` covers the XML parser, every path command,
paint and transform parsing, stylesheet specificity, shape/text/group
conversion, opacity and blend, pixel fallback with referenced definitions,
hidden content, the layer limit, real-world Illustrator markup and the safety
rejections. `tests/svg-import.test.mjs` covers the sanitizer.
`tests/browser/svg-support.spec.ts` (desktop and mobile) opens a mixed SVG,
checks the saved layer kinds, compares the imported shapes with the browser's
own render of the source (mean channel difference under 1.5/255), and places
an SVG by drag-and-drop.
