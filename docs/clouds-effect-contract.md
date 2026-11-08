# Render Clouds contract

PixelForge exposes `Filter → Render → Clouds` as a bounded, nondestructive
local approximation of Photoshop Clouds. The source asset is never replaced;
the effect is stored as editable metadata on the layer and replays the same
pixels after undo, local reload, project import, worker rendering and
recorded Actions.

## Colour clouds (created from the menu)

Choosing Render → Clouds stores a `cloudRender` block:

- `foreground` and `background`: the drawing and background colours at the
  moment the filter was chosen. Each pixel is a mix of the two, weighted by
  a seeded multi-octave value-noise field, so every result colour lies on the
  line between them.
- `scale`: the largest feature size in pixels, 2–2048. The default is a
  quarter of the document's shorter side (200 px for 1200×800, 662 px for
  2646×4096). Octaves are added down to roughly 2 px, so large clouds keep
  fine detail.
- The noise generator (`forEachCloudRow`) is shared with Difference Clouds,
  which additionally offsets each octave's lattice; Clouds keeps the aligned
  lattice, so its output is unchanged.
- Each render is stretched to its own noise range, so the result always
  spans the full background-to-foreground mix. Without this, a cloud size near
  the image size left the whole image in a narrow mid-grey band.
- Rendering caches each octave's lattice rows instead of hashing per pixel;
  the output is bit-identical to the per-pixel form. A 2646×4096 colour-clouds
  render takes about 3 s in Node on a desktop CPU (13.8 s before), and the
  legacy grayscale overlay about 1.3 s (3.6 s before).
- `fill`: when true (the default) transparent pixels are rendered too, so an
  empty layer becomes a full cloud layer, as in Photoshop. Filled pixels take
  the cloud colour outright and get `255 × amount` coverage. When false,
  transparent pixels and their hidden RGB are left untouched.

`amount` (0–100) mixes the clouds with existing pixels; `seed` is an unsigned
32-bit value. Malformed `cloudRender` values (bad hex colours, non-integer or
out-of-range scale, non-boolean fill) are dropped at normalisation and
rejected by validation; the block is only valid on `clouds` records.

## Legacy grayscale clouds

Records without `cloudRender` (projects saved before colour clouds) keep the
original behaviour: a four-octave grayscale texture blended into visible
pixels, with `radius` (1–64) as the scale, alpha and hidden RGB of
transparent pixels unchanged. Re-applying Render → Clouds creates colour
clouds.

This is not a claim of Photoshop's exact noise, turbulence controls or
Alt-modified contrast. A zero amount is an identity and does not create a
history entry.

## Evidence

- `tests/clouds-render.test.mjs`: empty-layer fill, colours bounded by the
  pair, no-fill transparency, amount mixing and partial coverage,
  determinism, seed and colour swaps, scale smoothness, source immutability,
  legacy parity, validation and default scale.
- `tests/clouds-filter.test.mjs`: legacy determinism, identity, alpha and
  hidden RGB, metadata validation and Action allow-list.
- `tests/filter-action-parameters.test.mjs`: `cloudRender` recorded and
  replayed by Actions.
- `tests/browser/clouds-filter.spec.ts` and `clouds-render.spec.ts` (desktop
  and mobile): menu activation, default colours and size, empty-layer fill,
  editable colours/size/fill, undo, reload and project round trip, and a
  2646×4096 canvas defaulting to 662 px clouds.
