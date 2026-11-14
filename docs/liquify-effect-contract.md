# Liquify effect contract

`Filter → Distort → Liquify…` is a bounded, nondestructive local warp. It
stores only the validated effect metadata (`amount`, `radius`, `angle`, and
normalized centre); the raster asset remains immutable and the renderer uses
an inverse premultiplied-alpha bilinear source sample. The radial influence
fades to identity at its edge, preserves destination alpha and transparent
hidden RGB, and is undoable and reload-safe.

`radius` sets the influence to `radius / 64 × 70 %` of the shorter side (the
panel reads **Liquify radius** in percent of the shorter side). Modes:
**Push** moves content along the angle (0° = right); **Twist** rotates content
by the angle with a slight swelling; **Bloat** samples nearer the centre, so the
content under the radius grows (earlier builds sampled farther out, which
shrank it).

This is an offline local push/twist/bloat approximation. It does not claim
Photoshop's mesh deformation, brush-history semantics, face-aware controls,
depth reconstruction or GPU acceleration. The pure pixel contract is covered
in `tests/filter-effects.test.mjs`; menu, source-retention and reload coverage
is in `tests/browser/filter-effects.spec.ts`.
