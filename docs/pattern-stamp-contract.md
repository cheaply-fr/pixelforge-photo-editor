# Pattern Stamp contract

Pattern Stamp is PixelForge's local, Photoshop-style `S` family tool. It
composites a deterministic tile through the same bounded radial coverage used
by Brush and Clone. The source is generated from the foreground/background
colour wells; PixelForge never uploads a pattern source or stores a hidden
image asset for this tool.

The persisted settings are `patternId` (`checker`, `stripes`, `dots`, `grid`,
or `diagonal`) and `patternTileSize` (an integer from 4 through 128 pixels).
Older drafts omit both keys and safely use `checker` and 32 px. Draft
validation rejects unknown ids, non-integer sizes and out-of-range sizes.

Each pointer sample is clipped to a local radial bounds rectangle before
Canvas2D `getImageData`/`putImageData`. The pure `applyPatternStamp` primitive
enforces the 16,000 × 16,000 / 16 million-pixel canvas limits, validates all
RGBA channels and preserves the absolute tile phase when a bounded sub-buffer
is processed. Softness, opacity and opt-in pen/touch pressure are inherited
from the common brush contract. A locked, hidden or non-raster active layer is
rejected before decode and does not create history. Pointer cancellation
restores the previous render; a completed gesture creates one undoable raster
asset commit.

The current patterns are intentionally small local motifs rather than a
general pattern-import system. Image-defined presets, custom pattern libraries
and GPU/worker tiled painting remain later scale milestones. Coverage lives in
`tests/pattern-stamp.test.mjs` and
`tests/browser/pattern-stamp.spec.ts` (desktop and mobile projects), including
determinism, edge clipping, alpha compositing, settings persistence,
undo/redo, reload and locked-layer rejection.

## Pattern from selection and Aligned (toolbar audit I-17, 2026-11)

"Define pattern from selection" (Pattern Stamp options; enabled with an active
selection) crops the selected pixels of the active raster layer to the
selection bounds, multiplies their alpha by the selection coverage and stores
the result as a small PNG in `Settings.imagePatterns` (at most eight patterns,
128 px per side; larger selections are box-filtered down; `src/imagePatterns.ts`).
This is the one case where Pattern Stamp keeps image data: the tile lives only
in the local draft and project file, never in a remote request. The new
pattern becomes the source (`retouchOptions.patternImage`) and is listed in the
Pattern menu next to the procedural patterns; picking a procedural pattern or a
saved preset clears it. Image tiles ignore Tile size and the colour wells.

`retouchOptions.patternAligned` (default on) keeps the existing canvas-wide
tile phase; with it off each stroke restarts the tile at the stroke's start
point. Impressionist is not implemented. Evidence: `tests/audit-retouch.test.mjs`
and `tests/browser/audit-retouch-stamps.spec.ts` (desktop and mobile).
