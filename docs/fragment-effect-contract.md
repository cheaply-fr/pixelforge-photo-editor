# Fragment filter contract

Pixel's **Filter → Pixelate → Fragment** command is a bounded, nondestructive
local approximation of Photoshop Fragment. Adobe describes Fragment as making
four copies of the selected pixels, averaging them and offsetting the copies.
Pixel stores only validated `filterEffects` metadata (`type: fragment`,
`amount`, `radius`, centre and seed); the immutable source asset is never
replaced. See the [Adobe filter reference](https://helpx.adobe.com/photoshop/desktop/effects-filters/blur-sharpen-filters/filter-effects-reference.html)
for the source capability description.

The renderer samples the source at four clamped diagonal offsets around each
visible destination pixel, alpha-weights their RGB values, and blends that
average by `amount`. Destination alpha and fully transparent RGB padding stay
source-owned. `radius` is the bounded integer offset (1–64 px), processing
never wraps or expands the canvas, and amount/radius zero are exact identity
copies. No generated pixels are persisted, and the same metadata is
deterministic offline.

Pure coverage in `tests/fragment-filter.test.mjs` checks the four-copy impulse
footprint, offset and amount behavior, edge clamping, one-dimensional/tiny
images, flat-color identity, transparent and partial-alpha safety, metadata
validation, document round trips, buffer bounds, and action replay
serialization. Desktop and mobile acceptance in
`tests/browser/filter-effects.spec.ts` checks menu activation, representative
pixel output, editable offset persistence, immutable source retention, local
reload/project import and undo. Export uses the normal PNG/JPEG/WebP pipeline,
which renders the current nondestructive state without changing the source.

This is a local four-sample approximation: Photoshop's exact kernel, selection
clipping behavior, and GPU implementation remain separate compatibility work.
