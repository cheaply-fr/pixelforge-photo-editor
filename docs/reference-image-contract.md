# Reference image contract

A document can hold one **reference / guide image**: an overlay for tracing,
colour matching or composition that is never part of the artwork.

## Model

The reference is stored on the frame as `frame.reference`, not as a layer:

```ts
{ asset, name, opacity /* 0–1 */, visible, locked, fit /* contain | cover | stretch */, sample }
```

Because it is frame state it is undoable and is saved with local drafts and
`.pixelforge` projects through the normal asset pipeline (`referencedAssets`
keeps its bitmap). Validation is strict: unknown keys, out-of-range opacity,
unknown fit modes, a missing or oversized asset, or a reference inside a
nested smart-object document reject the frame. Documents without the field
load unchanged.

The bitmap is decoded locally and stored downscaled to a 2048 px longest edge
(never upscaled). It is placed relative to the current canvas by the fit mode,
so crop, canvas-size and image-size changes refit it instead of invalidating
it.

## Exclusions

Export (PNG/JPEG/WebP/PSD/PDF, artboards, batch), Flatten Image, merges,
Copy Merged and the layer pixel budget all operate on `frame.layers` and
never include the reference. Flatten keeps the reference as a guide. The
reference does not count toward the layer limit or the layer pixel
budget; its stored PNG does count toward the per-document asset byte limit
like any other saved image data.

## UI

- **File → Place reference image…** or the **Reference image** inspector panel
  (above Layers, with its own icon and a "Not exported" badge and disclosure)
  places or replaces the image.
- Visibility, opacity, placement (fit inside / fill-crop / stretch) and
  removal are in the panel. **Lock** prevents replacing, refitting, opacity
  changes and removal; visibility and eyedropper sampling remain available.
- The overlay is drawn above the canvas with `pointer-events: none`, so tools
  act on the artwork beneath it.
- With **Eyedropper samples the reference** checked and the reference visible,
  the Eyedropper reads the reference bitmap under the pointer; outside the
  reference (letterbox area) it reports that nothing was sampled. Otherwise the
  Eyedropper samples the rendered artwork as before.

## Tests

`tests/reference-image.test.mjs` covers validation, frame validation and
legacy frames, asset retention, budget exclusion, stored-size downscaling and
fit/point mapping. `tests/browser/reference-image.spec.ts` (desktop and
mobile) covers identical export bytes with and without a reference, the
unchanged layer count and budget readout, Flatten, opacity/visibility/
placement/lock with undo, eyedropper sampling, project download, draft reload
and project import round trips.

This is a guide overlay; it does not claim Photoshop's placed-guide, template
or non-printing layer semantics.
