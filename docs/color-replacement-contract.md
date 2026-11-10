# Color Replacement tool contract

Color Replacement is a local raster brush. On pointer down it decodes the
selected raster layer once; that stroke-start surface is held unchanged for the
whole gesture, so repeated pointer events do not compound color drift or widen
the match range. Matching pixels inside the circular stroke are recoloured
according to the Mode, Sampling and Limits options below.

## Persisted state

`Settings.colorTolerance` is stored with the anonymous draft and private cloud
project file. It is a validated `0–255` channel-distance threshold and defaults
to `24` when loading an older draft. `size`, `brushOpacity`, `color`,
`backgroundColor` and the selected `color-replace` tool are persisted through
the same settings object. Mode, Sampling and Limits are stored in
`Settings.retouchOptions` as `colorReplaceMode`, `colorReplaceSampling` and
`colorReplaceLimits`; drafts without them use the defaults (Color, Continuous,
Contiguous). Pointer pressure is transient: supported pen/touch pressure scales
the stroke's opacity while a mouse with no pressure uses a deterministic value
of `1`.

## Pixel behavior

A pixel matches when it is visible and its maximum absolute RGBA channel
distance to the sampled target is within the tolerance.

- **Mode** (`src/colorReplace.ts`, W3C non-separable blend formulas):
  **Color** (default) keeps the pixel's luminosity and takes the hue and
  saturation of the foreground colour; **Hue** takes only the hue;
  **Saturation** only the saturation; **Luminosity** only the luminosity;
  **Normal** paints the flat foreground colour (the tool's original
  behaviour). The result is blended by the configured opacity.
- **Sampling**: **Continuous** (default) re-samples the stroke-start pixel
  under every dab centre; **Once** samples the pixel under the press and keeps
  it for the whole stroke; **Background Swatch** replaces colours matching the
  background colour well (opaque).
- **Limits**: **Contiguous** (default) replaces, per dab, only matching pixels
  4-connected to the dab centre inside the brush circle (nothing when the
  centre does not match); **Discontiguous** replaces every matching pixel in
  the circle.

Source alpha is preserved; pixels outside the circular brush or beyond the
tolerance remain bit-for-bit unchanged. Each completed gesture commits one
immutable PNG asset, so undo, local draft recovery and project export preserve
the previous source. These are bounded local approximations of Photoshop's
options; there is no colour management or edge-aware sampling.

## Acceptance evidence

`tests/audit-retouch.test.mjs` covers the mode formulas, Continuous versus
Once sampling and Contiguous versus Discontiguous limits.
`replaceColorStroke` without options keeps the legacy Normal/Once/Discontiguous
result (`tests/stroke-window.test.mjs`). The browser suites select Color
Replace on both desktop and mobile projects: `tests/browser/layers.spec.ts`
(Normal mode) changes tolerance and opacity, replaces a representative color,
inspects the exported asset and confirms unrelated pixels stay unchanged, then
reloads; `tests/browser/audit-retouch-paint.spec.ts` checks the luminosity kept
by Color mode, flat Normal paint, Background Swatch with Discontiguous, and the
options after reload. A non-raster, locked or hidden layer is rejected without
mutating the draft.

Each segment reads and writes only the window its stamps can reach
(`src/strokeWindow.ts`), so a pointer move on a large layer costs the brush
area rather than the whole layer.

Mixer Brush blending and global color management remain separate roadmap work.
