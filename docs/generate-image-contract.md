# Generate Image contract

`Edit -> Generate Image...` is an anonymous, offline approximation for creating
an abstract editable raster layer. It does not call a model, send a prompt to a
provider, upload document pixels, or claim semantic prompt-following generation.

The dialog accepts a trimmed description up to 240 characters, integer width and
height from 32 through 1024 pixels, a one-megapixel total pixel budget, and an
optional integer seed. The description selects one of four deterministic local
styles: gradient (default), stripes, dots, or noise. A small named-colour
allow-list supplies the first two palette colours; unrecognised colours fall
back to bounded defaults. Invalid, empty, oversized, fractional, out-of-range,
or over-budget requests fail closed without changing the document.

On success the renderer creates an opaque RGBA surface, inserts it as a new
`Generated Image` raster layer centred on the current canvas, and records the
operation through the existing history and asset model. The source remains
editable, and the layer/asset survives anonymous draft reload and portable
project export. The layer limit is enforced before allocation.

Pure coverage is in `tests/generate-image.test.mjs` (normalisation, deterministic
pixels, style/colour selection, bounds and malformed input). Desktop and mobile
coverage is in `tests/browser/generate-image.spec.ts` (layer creation, dimensions,
reload persistence and empty-input failure). A future provider-backed or
semantic implementation would require a separate privacy, authorization,
quota, cancellation, cost and failure contract.
