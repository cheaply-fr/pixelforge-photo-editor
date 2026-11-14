# Background Eraser and Magic Eraser contract

`src/erasers.ts` contains the pixel contract for the two staged eraser tools.
The byte-array operations return a new RGBA buffer and a full-canvas alpha mask;
they never mutate the source asset. A document command can therefore retain the
old asset for undo/redo and publish the returned buffer as the next version.

## Magic Eraser

`applyMagicEraser(source, options)` samples the clicked pixel (or an explicit
`target`) and removes matching pixels with a max-channel tolerance from 0 to
255. Matching is four-connected by default; `contiguous: false` removes every
matching pixel in the canvas. `opacity` supports a partial alpha removal. Fully
transparent pixels have their hidden RGB cleared for deterministic exports.

## Background Eraser

`applyBackgroundEraser(source, options)` uses the sampled color and a bounded
radial stamp. `hardness`, `size`, `opacity`, tolerance, and connected matching
are validated before rendering. The radial mask is clipped to the canvas, and
RGBA matching includes alpha so low-tolerance anti-aliased edges remain intact.
`applyBackgroundEraserStroke` uses an immutable source sample across a pointer
line and unions repeated stamp coverage once per pixel. The tool's Size,
Hardness, Opacity and Color tolerance options all reach the stroke: Hardness
0 fades the dab to nothing at its edge, Hardness 100 is a hard disc
(`tests/erasers.test.mjs` and `tests/browser/eraser.spec.ts` check a pixel
40 px from the centre of a 100 px dab).

`eraseMagicRegion` and `eraseBackgroundStroke` are Canvas adapters for callers
that commit an already-tested operation to a surface. They write only when a
pixel changes and return a boolean suitable for one undo history command.
`eraseBackgroundStroke` reads and writes only the segment's window (the stamp
reach around its two points, `src/strokeWindow.ts`), so a pointer move costs
the brush area rather than the whole layer; `tests/stroke-window.test.mjs`
checks it against the full-layer kernel byte for byte.

Focused pure coverage lives in `tests/erasers.test.mjs`: transparent and opaque
edges, tolerance boundaries, contiguous/disconnected regions, partial opacity,
clipped stamps, source immutability, deterministic replay, malformed settings,
and stroke behavior. `tests/browser/eraser.spec.ts` covers the exposed toolbar
controls on desktop and Pixel 7, Photoshop `E` cycling, persisted tolerance and
tool state, contiguous-island pixel assertions, undo/redo, local reload and
touch cancellation. Locked and hidden layer guards use the same shared layer
contract as the other raster tools; cloud authorization remains covered by the
project-level acceptance suite.
