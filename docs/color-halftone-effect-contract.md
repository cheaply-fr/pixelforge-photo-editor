# Color Halftone effect contract

PixelForge's **Filter → Pixelate → Color Halftone…** command is a local,
nondestructive approximation of a four-plate print screen. The active layer
stores `filterEffects.type = color-halftone`, bounded `amount` and `radius`
(the maximum cell size), and four bounded screen angles:

```ts
colorHalftone: {
  cyanAngle: 108,
  magentaAngle: 162,
  yellowAngle: 90,
  blackAngle: 45,
}
```

Rendering derives CMYK ink coverage from an immutable source sample at each
rotated cell centre. Each plate receives a deterministic antialiased circular
dot, then the four plates are composited in subtractive CMYK order. The
renderer clamps cell size and angles, preserves every source alpha byte and
hidden RGB value at transparent pixels, and blends only visible RGB channels
by `amount`. No generated pixels are persisted: reload, local draft recovery,
project export/import, undo and Action replay recompute the same result from
the validated metadata.

The local contract intentionally does not claim a print-production match.
Paper white, dot gain, channel trapping, calibration profiles, plate-specific
screen frequencies and Photoshop's full 127 px maximum-radius dialog remain
staged. The current 2–64 px cell bound is chosen for predictable browser
memory and interactive latency on the editor's supported documents.

Pure tests cover deterministic output, per-pixel alpha preservation, hidden
RGB safety, source immutability, amount/radius identity boundaries, angle
normalization and invalid metadata rejection. Desktop and mobile acceptance
cover menu enablement, CMYK angle inspectors, representative pixels, source
asset retention, local reload, project round-trip and undo. The effect remains
available anonymously and does not require a network request.
