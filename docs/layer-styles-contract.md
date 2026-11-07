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
  `-1000..1000` pixels, box blur `0..250` pixels and inward edge distance
  `1..250` pixels. It is clipped to the source alpha and never paints
  transparent pixels. The edge distance uses a separable van Herk/Gil-Werman
  square erosion whose cost does not depend on the distance; its pixels are
  identical to the historical per-pixel square window.
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
- Glow blend modes are applied against the layer's own styled pixels (the
  source for Inner Glow; the drop shadow or transparent area for Outer Glow,
  where every mode reduces to Normal). The styled layer is then composited
  onto lower layers with the layer's own blend mode. This is a bounded local
  approximation: an Outer Glow in Screen mode is not screened against lower
  layers as it would be in editors that composite each effect separately.
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
coordinates before filters, masks, transforms and group compositing; editable
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
layer within a fixed time bound. Drop and inner shadows keep their single box
pass so existing documents render unchanged; at large radii that falloff is
linear rather than Gaussian. Pure tests are in
[`tests/layer-styles.test.mjs`](../tests/layer-styles.test.mjs); desktop and
mobile glow falloff, export, undo, reload, import and lock checks are in
[`tests/browser/blend-modes-glow.spec.ts`](../tests/browser/blend-modes-glow.spec.ts).
