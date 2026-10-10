# Mezzotint effect contract

PixelForge's **Filter → Pixelate → Mezzotint…** command is a bounded,
nondestructive local approximation of Photoshop Mezzotint. The effect stores
validated `filterEffects` metadata (`type: mezzotint`, `amount`, `radius`,
`seed`, centre/angle fields retained by the shared filter schema, and
`mezzotint.grain`) on the selected layer. The immutable source asset is never
replaced and generated pixels are not persisted.

At full strength the renderer converts each visible source pixel to luminance
and compares it with a deterministic seeded threshold field. Fine, medium and
coarse grain modes change the threshold cell scale; `radius` remains bounded
to 1–64 pixels and `seed` is an unsigned 32-bit integer, so the same project
metadata produces the same output offline and after a reload or import. The
effect keeps the source alpha byte-for-byte stable and leaves fully transparent
RGB padding untouched. Amount zero and radius zero are detached identity
copies, and processing never wraps or expands the canvas.

The first stage intentionally uses a local monochrome grain approximation. It
does not claim Photoshop's exact stochastic screen, tonal curve, print
calibration, selection-specific dither, or GPU implementation. Pure coverage
in `tests/mezzotint-filter.test.mjs` checks seeded determinism, monochrome
output, fine/medium/coarse settings, amount/radius identities, edge bounds,
alpha and hidden-RGB safety, metadata validation, document round trips and
Action serialization. Desktop and mobile acceptance in
`tests/browser/filter-effects.spec.ts` checks menu activation, editable grain
controls, representative pixels, source retention, reload/project import,
undo and deterministic seed changes. The normal PNG/JPEG/WebP export pipeline
renders the current nondestructive state without modifying the source asset.
