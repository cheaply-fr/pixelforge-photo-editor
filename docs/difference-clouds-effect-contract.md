# Difference Clouds filter contract

PixelForge's **Filter → Render → Difference Clouds** command is a local,
nondestructive procedural approximation. It stores
`filterEffects.type = difference-clouds` on the selected layer and replays the
effect from the immutable source asset on every render; generated pixels are
never persisted as a replacement asset.

The renderer uses the same smooth multi-octave value noise as Render →
Clouds (`forEachCloudRow` / `cloudField` in `src/filterEffects.ts`): octaves
down to about 2 px, smoothstep interpolation and the persisted unsigned
`seed`. Each octave's lattice is shifted by a seeded sub-cell offset so the
octaves never share lattice lines; without it the old renderer flattened every
octave on the same columns and rows and showed a blocky grid. The field is
stretched to the full black-to-white range, like colour Clouds.

`cloudScale` (2–2048 px, the **Cloud size** control, the same range as Clouds'
size) is the largest feature size. New records default to a quarter of the
document's shorter side, as Clouds does. `amount` (0–100) blends the result.

The layer is composited over black before the difference blend, so a
transparent pixel counts as black and an empty layer becomes the clouds
themselves. The clouds are opaque: with coverage `a` and amount `s`, output
alpha is `a + (1 − a)·s` and premultiplied colour is
`c·a·(1 − s) + |c·a − cloud|·s`. An opaque layer keeps alpha 255 and gets
`c·(1 − s) + |c − cloud|·s`. Amount 0 (and radius 0) remain identities that
return a detached buffer. The same pure algorithm runs in the main-thread and
worker render paths, and Actions record `cloudScale`.

## Saved documents

Records saved before this change have no `cloudScale`; they still load and
validate. They render with the new generator at a cloud size equal to their
old `radius` (clamped to 2–64, the old cloud scale), and transparent pixels
now count as black, so a legacy Difference Clouds on a transparent layer
shows clouds there instead of nothing. Pixels differ from the old blocky
render; the metadata is unchanged until the user edits **Cloud size**, which
stores `cloudScale`. Out-of-range `cloudScale` values are clamped and rounded
at normalisation and rejected by strict validation (and on any other filter
type).

It intentionally labels its limits: it does not claim Photoshop's
exact stochastic noise, foreground/background colour controls, seamless
wrap-around, GPU implementation or production colour-management parity. It is
an offline local approximation suitable for editable projects and Actions.

The contract requires coverage for deterministic repeatability, seed and scale
variation, amount/radius identities, transparent-as-black and partial-alpha
behaviour, smoothness without lattice-aligned grid artefacts, the scale range
and legacy migration, source immutability, malformed metadata rejection,
project round trips and Action allow-list/replay
(`tests/difference-clouds-filter.test.mjs`,
`tests/difference-clouds-levels-invert.test.mjs`). Browser acceptance covers
the Render menu command, editable controls, undo, local-draft reload and
project export/import on the desktop/mobile viewport matrix
(`tests/browser/filter-effects.spec.ts`,
`tests/browser/difference-clouds-levels-invert.spec.ts`).
