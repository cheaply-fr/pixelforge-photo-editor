# Dodge, Burn and Sponge contract

PixelForge's Dodge, Burn and Sponge tools are local, undoable raster commands.
Each pointer gesture decodes the selected raster asset into an immutable source
and a private destination buffer, applies bounded radial coverage along the
stroke, then commits one new asset. The original asset remains available to
undo/redo and is included in local/project round trips.

## Pixel behavior

- Dodge moves RGB channels toward white; Burn moves them toward black.
- Exposure and flow are normalized amounts and are multiplied by radial
  coverage. Shadows, midtones and highlights use deterministic luminance range
  weights so a stroke can be targeted without changing alpha.
- Sponge supports Saturate and Desaturate. Its vibrance amount is multiplied by
  the brush Flow setting, then raises or lowers HSL saturation while preserving
  hue, lightness and alpha.
- An active selection is rendered once at pointer-down and sampled into the
  edited raster asset's local pixel space. Feathered and inverted selections,
  transformed layers, and partially selected pixels constrain every segment
  without changing bytes outside the selection.
- Fully transparent pixels are skipped, including hidden RGB bytes. Opaque and
  partially transparent pixels retain their original alpha byte.
- Hard and soft radial masks are clipped to canvas bounds and stroke segments
  are sampled at bounded intervals. Replaying the same source/destination and
  settings returns identical bytes.

## Interaction and persistence

`O` cycles Dodge, Burn and Sponge; `Shift+O` cycles in reverse. Tool state,
size, hardness, flow, exposure, tonal range, sponge mode and vibrance are
validated in drafts and restored after bookmark/reload. Locked, hidden and
non-raster layers reject strokes. A fully transparent or fully excluded
gesture is an explicit no-op and does not add an asset or history entry. If
the document or target layer changes while an asset is decoding, the gesture
is cancelled instead of committing against stale state. Pointer cancellation
restores the last committed frame without adding history. Desktop and mobile
acceptance tests cover toolbar and shortcut activation, representative
pixel/alpha changes, active selections, settings persistence, undo/redo,
no-op history behavior, lock guards and touch cancellation.

Each tonal segment reads, validates and writes back only the segment's window
of the gesture buffer (the brush reach around its two points, see
`src/strokeWindow.ts`), so a pointer move costs the brush area rather than the
whole layer; windowed and full-layer kernels give the same bytes
(`tests/stroke-window.test.mjs`). Live previews of worker-sized documents use
the shared coalesced gesture preview: the buffer is transferred to the
persistent render worker, which starts from its cached composite below the
edited layer (see [worker-render-contract.md](./worker-render-contract.md)).
Layers above the edited one are still composited per preview, the whole layer
bitmap is transferred per preview, and the commit still encodes the changed
layer. Non-destructive adjustment command layers remain staged behind the
performance and serialization milestones; this contract does not claim
Photoshop-scale memory or latency for very large images.

The implementation intentionally remains a baked raster command rather than a
Photoshop adjustment layer. Non-destructive tonal command metadata and
pressure-sensitive exposure are separate roadmap work.
