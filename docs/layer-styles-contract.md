# Layer Styles milestone contract

This milestone defines a bounded, editable Layer Style stack without changing
the existing raster assets, selection masks, or filter effect metadata. The
standalone implementation is in `src/layerStyles.ts`; it is intentionally
pure so the main-thread renderer and the OffscreenCanvas worker can share the
same pixel recipe.

Each layer may persist a `styles` object containing nine optional decorations:
`dropShadow`, `innerShadow`, `outerGlow`, `innerGlow`, `bevelEmboss`,
`outline`, `colorOverlay`, `gradientOverlay` and `patternOverlay`. Documents
saved before a decoration existed omit it and load with its neutral disabled
default.
The values are finite and bounded:

- Drop shadow uses a six-digit hex colour, opacity `0..1`, offsets
  `-1000..1000` pixels, and box blur `0..250` pixels.
- Inner shadow uses a six-digit hex colour, opacity `0..1`, offsets
  `-1000..1000` pixels, blur `0..250` pixels and inward edge (choke) distance
  `1..250` pixels. Its source is everything outside the layer's alpha
  (including beyond the layer bounds) plus a band `distance` pixels wide
  inside the edge, measured with an exact Euclidean distance transform
  (separable, cost independent of the distance), so a circle chokes to a
  smaller circle. That source is blurred, then moved by the X/Y offset like
  Drop Shadow: a pixel reads the shadow `offset` pixels back toward the light,
  so an offset of (0, 15) shades the top inner edge and leaves the bottom
  clear. It is clipped to the source alpha and never paints transparent
  pixels. Before this change the band came from a square-window erosion
  (corners darker than edges; distance 60 on a circle left a square-ish
  hole) and the offset only shifted that band, so the shadow was not
  directional.
- Outer glow uses a six-digit hex colour (default `#ffffbe`), opacity `0..1`,
  size `0..250` pixels, spread `0..100` percent and any layer blend mode
  (default Screen). The alpha is softened by three radius-independent box
  passes (an approximately Gaussian falloff about `size` pixels wide) and
  spread hardens the softened mask like a levels clip, 100% giving a hard
  edge. It is drawn above the drop shadow and below the outline and source.
- Inner glow uses the same colour/opacity/size/blend fields plus choke
  `0..100` percent and source `edge` or `center`. It blurs the inverse alpha
  (transparent outside the layer), is clipped to the source alpha and is drawn
  after the inner shadow and before bevel/emboss.
- Inner Glow's blend mode is applied against the layer's own source pixels.
  Outer Glow and Drop Shadow blend with the pixels **beneath the layer**:
  see "Outer effects blend with the backdrop" below.
- Drop shadow and inner shadow also store `falloff` (`gaussian` or `box`)
  and the drop shadow stores `blend` (any layer blend mode, default Normal);
  see "Gaussian shadow falloff" below.
- Bevel and Emboss uses bounded highlight/shadow colours, opacity `0..1`, a
  light angle `-180..180` degrees, depth `1..32` pixels and blur `0..32`
  pixels. It shades directional alpha edges without changing source pixels.
- Outline uses a six-digit hex colour, opacity `0..1`, and width `1..32`
  pixels.
- Color overlay uses a six-digit hex colour and opacity `0..1`; it blends over
  the rendered source alpha without changing the immutable asset.
- Gradient overlay uses bounded six-digit start/end colours, opacity `0..1`,
  angle `-180..180` degrees and an explicit reverse flag; it interpolates
  over the source alpha without changing the immutable asset.
- Pattern overlay uses one of the bounded local `checker`, `stripes`, `dots`,
  `grid` or `diagonal` tiles, six-digit foreground/background colours,
  opacity `0..1` and an integer tile size of `4..128` pixels. It repeats the
  deterministic tile over the source alpha without allocating or retaining a
  source image.
- `enabled` is explicit on every decoration. Missing or malformed legacy
  values resolve to the neutral disabled defaults.

`applyLayerStylesPixels` receives RGBA bytes and returns a new byte array. It
draws the outer shadow first, then the outline ring, then source pixels over
both, then clipped inner-shadow and bevel/emboss shading, and finally blends
enabled colour, gradient and pattern overlays over source-covered pixels.
The source array is never mutated; transparent pixels retain their hidden RGB
bytes, and all math uses integer alpha operations
plus a separable box blur. This gives the worker and browser renderer identical
pixels and avoids browser-specific `CanvasRenderingContext2D.filter` output.

The document model validates the optional `styles` object at every import,
local-draft and cloud-project boundary. Raster layers apply it in local
coordinates after the filter stack and the live filter (so a Clouds or Light
Rays layer is decorated from the generated pixels) and before transforms and
group compositing. A raster or smart-object layer with an enabled pixel mask
instead applies its styles in frame space after the mask, so they follow
layer alpha x mask: a full-canvas Clouds layer masked to a circle glows and
shades around the circle. Layer → Rasterize keeps enabled styles on the new
raster layer (they are not baked into its pixels) and says so in the status;
the mask, filters and adjustments are baked as before. Editable
text/vector layers use the isolated render path so their source metadata stays
editable. The source asset and mask references remain unchanged, so duplicate,
undo, reload, export and history trimming continue to work through the existing
document model. The Layers panel exposes both toggles and bounded controls and
disables them for locked layers.

Desktop and mobile browser tests verify that style toggles change rendered
pixels, project export/reload preserves the metadata, and undo restores the
neutral style while the original asset id is unchanged. Inner-shadow tests
also cover zero-blur edge pixels and source-alpha clipping; bevel/emboss tests
cover directional edge shading and reload. Locked-layer tests verify that
every style control is disabled.

This contract deliberately excludes selections, masks, filters, and rasterize:
Layer Styles decorate the rendered result and never bake or rewrite any of
those data structures. Gradient stops and editable style ordering remain
staged until each has its own pixel and persistence contract.

## Large-document bounds (2026-11-07)

Recorded from a 2646×4096 painting session and addressed on
`feat/glow-styles-and-blend-modes`: shadow blur and glow size go to 250 px,
offsets to ±1000 px and inner-shadow distance to 250 px. Every blur is a
sliding-window box pass and the erosion is separable, so the cost grows only
with the cropped working area (painted bounds plus padding), not with the
radius; the unit suite renders all four large-radius styles on a 1200×900
layer within a fixed time bound. Shadows saved by this release keep their
single box pass (a linear falloff at large radii); the Gaussian option below
is the default for new layers. Pure tests are in
[`tests/layer-styles.test.mjs`](../tests/layer-styles.test.mjs); desktop and
mobile glow falloff, export, undo, reload, import and lock checks are in
[`tests/browser/blend-modes-glow.spec.ts`](../tests/browser/blend-modes-glow.spec.ts).

## Outer effects blend with the backdrop (fix wave 2 polish)

When an enabled Drop Shadow or Outer Glow uses a blend mode other than
Normal, `renderFrame` composites the layer in passes instead of one:
the drop shadow alone, then the outer glow alone, each onto the pixels
already rendered beneath the layer with its own blend mode, then the layer
body (source, outline, inner effects, overlays) with the layer's blend mode.
Layer opacity scales every pass. A Screen glow therefore brightens a dark
backdrop and leaves a bright one bright, and a Multiply glow darkens it.
Each pass renders through the same local and frame pipeline as the layer
(local filters, transform, masks, adjustments), so the viewport, render
worker, PNG/JPEG/WebP export and merge/flatten all use the same code path.
The passes are selected by a render-only `renderPart` tag on one-layer render
copies (`withLayerStylePart`); it is never persisted, and because it lives on
`styles` it is part of those copies' #185 local filter-cache key.

When both outer effects are Normal (or disabled) the layer keeps the single
historical pass and its pixels are unchanged. Inside a folder the backdrop is
the folder's own lower members, since folders composite in isolation. A
clipped layer's outer effects see no backdrop (the clipping branch renders the
layer alone), and the layer's filter effect is applied to each pass separately.
These are local approximations of per-effect compositing, not a claim of
Photoshop parity (no Knockout, Layer-knocks-out-shadow or Fill opacity).

Local measurement (Node, 2646×4096 layer, 1400×1600 painted, 120 px shadow
and glow): the three style passes together cost about the same as the single
pass (≈1.5 s each way); the extra frame-sized surfaces and composites are the
added cost in the browser.

## Gaussian shadow falloff

Drop and inner shadows store `falloff`: `gaussian` cascades three running-sum
box passes with variance matched to sigma = blur / 3 and total support ≤ blur
(`gaussianBoxHalfWidths` from the Gaussian Blur filter, #191, extended to the
250 px style bound), so the shadow reaches the same visible extent as before
with a bell-shaped edge instead of a linear ramp; `box` is the historical
single box pass. New layers (`neutralLayerStyles`) use `gaussian`. A stored
shadow without the field is a legacy document and resolves to `box` (and the
drop shadow's missing `blend` to Normal), so existing documents keep their
exact pixels until the user picks **Falloff → Gaussian**. Invalid values fail
validation. The Gaussian pass costs about 20% more than the box pass at large
radii and stays radius-independent.

Evidence: [`tests/effects-polish.test.mjs`](../tests/effects-polish.test.mjs)
(half-width bounds and variance up to 250 px, bell versus linear profile,
legacy equivalence, validation, 250 px time bound, backdrop-pass selection,
parts recomposing to the single pass, cache-key separation) and
[`tests/browser/effects-polish.spec.ts`](../tests/browser/effects-polish.spec.ts)
on desktop and mobile (Screen/Multiply Outer Glow and Screen Drop Shadow over a
dark and a bright layer below checked against the W3C Screen formula, export
equals canvas, undo, reload; Gaussian versus linear shadow profile, one-step
undo, and a legacy project without `falloff` importing with the linear
falloff and identical pixels).
