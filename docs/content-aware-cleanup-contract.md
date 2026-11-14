# Constrained Content-Aware Cleanup contract

`Edit → Content-Aware Fill…` is a local, deterministic cleanup operation for
small marks and simple backgrounds. It requires an existing selection on a
visible, unlocked raster layer. The selection is rendered once into a
layer-local alpha mask asset and the layer stores only this metadata:

```ts
{
  version: 1,
  mask: "asset-id",
  radius: 1..128,
  opacity: 0..1
}
```

The command sets `radius` from the selection, not from brush settings: half
the selection's larger bounding-box side plus two pixels, clamped to 4..128,
so the outer search ring reaches past the selection from every selected pixel
(selections up to about 250 px across are filled throughout). `opacity` is
always 1 (full strength); the shared brush Size and Opacity do not affect it.
Before committing, the command counts the selected pixels that have usable
context: when none do (for example Select All) it says nothing changed and
adds no operation; when only some do it reports the filled percentage.

Rendering searches a fixed 16-point angular lattice from one pixel through the
configured radius. It ignores masked pixels, computes per-channel medians from
the first usable ring and blends RGB by mask alpha and operation opacity. Layer
alpha is retained byte-for-byte; transparent RGB is normalized to zero. The
immutable source PNG remains the raster layer's `asset`, and the operation can
be undone, reloaded and exported with its mask asset.

This is intentionally constrained local synthesis. It does not detect objects,
understand subjects, reconstruct perspective, call an AI model or upload image
data. Large or fully surrounded selections safely remain unchanged when no
unmasked context exists. Semantic Content-Aware Move, generative fill and
remote/AI cleanup remain future roadmap work behind explicit privacy and
quality gates.

Validation rejects malformed metadata, missing or incorrectly sized mask
assets, invalid radius/opacity and more than 16 operations. Pure tests cover
median filling, feather/opacity, alpha and transparent edges, no-context
no-ops, deterministic replay and validation. Desktop and mobile acceptance
tests cover the menu command, source retention, undo/redo, reload/project
round-trip, missing-selection and locked-layer cancellation paths.

