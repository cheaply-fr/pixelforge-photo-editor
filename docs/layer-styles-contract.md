# Layer Styles milestone contract

This milestone defines a bounded, editable Layer Style stack without changing
the existing raster assets, selection masks, or filter effect metadata. The
standalone implementation is in `src/layerStyles.ts`; it is intentionally
pure so the main-thread renderer and the OffscreenCanvas worker can share the
same pixel recipe.

Each layer may persist a `styles` object containing three optional decorations:
`dropShadow`, `outline` and `colorOverlay`. The values are finite and bounded:

- Drop shadow uses a six-digit hex colour, opacity `0..1`, offsets `-256..256`
  pixels, and box blur `0..64` pixels.
- Outline uses a six-digit hex colour, opacity `0..1`, and width `1..32`
  pixels.
- Color overlay uses a six-digit hex colour and opacity `0..1`; it blends over
  the rendered source alpha without changing the immutable asset.
- `enabled` is explicit on both decorations. Missing or malformed legacy
  values resolve to the neutral disabled defaults.

`applyLayerStylesPixels` receives RGBA bytes and returns a new byte array. It
draws shadow first, then the outline ring, then source pixels over both, and
finally blends an enabled colour overlay over source-covered pixels. The
source array is never mutated, and all math uses integer alpha operations plus
a separable box blur. This gives the worker and browser renderer identical
pixels and avoids browser-specific `CanvasRenderingContext2D.filter` output.

The document model validates the optional `styles` object at every import,
local-draft and cloud-project boundary. Raster layers apply it in local
coordinates before filters, masks, transforms and group compositing; editable
text/vector layers use the isolated render path so their source metadata stays
editable. The source asset and mask references remain unchanged, so duplicate,
undo, reload, export and history trimming continue to work through the existing
document model. The Layers panel exposes both toggles and bounded controls and
disables them for locked layers.

Desktop and mobile browser tests verify that a style toggle changes rendered
pixels, project export/reload preserves the metadata, and undo restores the
neutral style while the original asset id is unchanged. Locked-layer tests
verify that every style control is disabled.

This contract deliberately excludes selections, masks, filters, and rasterize:
Layer Styles decorate the rendered result and never bake or rewrite any of
those data structures. Bevel/emboss, inner shadows, gradients and editable
those data structures. Bevel/emboss, inner shadows, gradients and editable
style ordering remain staged until each has its own pixel and persistence
contract.
