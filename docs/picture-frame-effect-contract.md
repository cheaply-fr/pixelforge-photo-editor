# Picture Frame effect contract

PixelForge implements **Filter → Render → Picture Frame…** as a bounded,
deterministic local approximation. The effect is nondestructive: the layer
stores only `filterEffects` metadata and the immutable raster asset remains the
source of every render.

## Metadata

The normalized record uses the shared Filter Effects fields:

| Field | Range | Meaning |
| --- | --- | --- |
| `type` | `picture-frame` | Selects this renderer |
| `amount` | 0–100 | Frame opacity/blend strength |
| `radius` | integer 0–64 | Inner frame width in source pixels |
| `seed` | unsigned 32-bit integer | Stable frame colour variation |

`radius: 0` or `amount: 0` is an exact identity and returns a detached copy.
The editor starts a new frame at 85% amount and 12 px width. The inspector
keeps amount, width and seed editable; all values survive undo, reload and
`.pixelforge` project round trips.

## Rendering and privacy boundary

The renderer composites a dark seeded colour with a narrow inner highlight
inside the existing canvas rectangle. It never expands or crops the canvas,
does not write outside visible source pixels, and leaves every destination
alpha byte unchanged. Transparent pixels retain both their original alpha and
hidden RGB padding, so transparent edges cannot acquire a halo. No source
pixels, generated buffers, account data or network requests leave the browser.

This is intentionally not Photoshop's full frame generator. Named frame
styles, foreground/background colour controls, paper/texture simulation,
bevel geometry and canvas expansion remain staged follow-up capabilities.

## Required evidence

Pure coverage checks deterministic output, seed variation, amount/width
identities, detached input safety, alpha/transparent-padding preservation,
small and one-dimensional dimensions, metadata normalization/validation and
document round trips. Browser coverage checks the enabled Render menu command,
visible output, editable controls, source-asset identity, undo, reload,
project import/export, and replay through the allow-listed local Action
command on desktop and mobile viewports.
