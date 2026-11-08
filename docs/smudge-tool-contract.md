# Smudge tool contract

PixelForge's Smudge tool is a local, undoable raster command. A pointer gesture
decodes the selected raster asset into an immutable source snapshot and a
private destination buffer, then blends source colour sampled behind the drag
direction into the destination under a bounded radial mask. The original asset
remains available to undo/redo and is included in local/project round trips.

## Pixel and safety behavior

- Flow is a normalized blend amount multiplied by radial coverage and source
  alpha. Hardness controls the radial plateau and soft edge.
- The source and destination inputs are never mutated. Replaying the same
  buffers and settings returns identical bytes.
- Destination alpha bytes are preserved exactly. Fully transparent destination
  pixels are skipped, and transparent source pixels never pull hidden RGB into
  visible artwork.
- A selection is rendered once at pointer-down and sampled in the edited
  raster's local pixel space. Feathered, inverted and transformed selections
  constrain every segment without changing bytes outside the selection.
- A stationary tap has no drag direction and is an explicit no-op, so it does
  not add an asset or history entry. Pointer cancellation restores the last
  committed frame; stale document/layer changes cancel instead of committing.

## Interaction and persistence

`R` activates Smudge. The toolbar exposes Size, Hardness and Flow controls;
settings are validated in drafts and restored after bookmark/reload. Locked,
hidden and non-raster layers reject strokes. Desktop and mobile acceptance
tests cover toolbar/shortcut activation, representative colour and alpha
assertions, active selection clipping, no-op history behavior, undo/redo,
local reload, project export/import, lock guards and touch cancellation.

Each segment reads and writes only its window of the gesture buffer: the
brush reach around its points plus the quarter-brush distance Smudge samples
behind each pixel (`src/strokeWindow.ts`; windowed and full-layer results are
byte-identical in `tests/stroke-window.test.mjs`). Live previews share the
coalesced worker gesture preview described in
[worker-render-contract.md](./worker-render-contract.md). Dirty-rectangle
previews and tile processing remain staged behind the large-image performance
milestone; this contract does not claim Photoshop-scale memory or latency.
