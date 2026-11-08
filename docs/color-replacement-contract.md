# Color Replacement tool contract

Color Replacement is a local raster brush. On pointer down it samples the
composited pixels of the selected raster layer, then replaces matching source
colors only inside the circular stroke. The source surface is held unchanged
for the duration of the gesture, so repeated pointer events do not compound
color drift or widen the match range.

## Persisted state

`Settings.colorTolerance` is stored with the anonymous draft and private cloud
project file. It is a validated `0–255` channel-distance threshold and defaults
to `24` when loading an older draft. `size`, `brushOpacity`, `color` and the
selected `color-replace` tool are persisted through the same settings object.
Pointer pressure is transient: supported pen/touch pressure scales the stroke's
opacity while a mouse with no pressure uses a deterministic value of `1`.

## Pixel behavior

The tool compares the source red, green, blue and alpha channels to the sampled
pixel using the maximum absolute channel distance. Matching pixels receive the
chosen color, blended by the configured opacity, while source alpha remains
unchanged. Pixels outside the circular brush or beyond the tolerance remain
bit-for-bit unchanged. Each completed gesture commits one immutable PNG asset,
so undo, local draft recovery and project export preserve the previous source.

## Acceptance evidence

The browser suite selects Color Replace on both desktop and mobile projects,
changes tolerance and opacity, replaces a representative color, inspects the
exported asset's red/green channel values and confirms unrelated pixels stay
unchanged, then reloads and checks the tool and settings round-trip. A
non-raster, locked or hidden layer is rejected without mutating the draft.

Each segment reads and writes only the window its stamps can reach
(`src/strokeWindow.ts`), so a pointer move on a large layer costs the brush
area rather than the whole layer.

This is a bounded local replacement primitive. Contiguous-region replacement,
edge-aware sampling, Mixer Brush blending and global color-management remain
separate roadmap work.
