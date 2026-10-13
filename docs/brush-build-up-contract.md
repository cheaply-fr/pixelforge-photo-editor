# Brush Build-up contract

PixelForge exposes Build-up as a bounded deterministic brush-tip control for Brush, Pencil, and Eraser stamps. The value is stored in project settings as `brushBuildUp` in the inclusive range `0..100`, defaults to `0`, and is restored through local drafts and project exports.

At `0`, the radial mask is unchanged. Higher values preserve centre coverage while reducing the outer deposit with a bounded quadratic falloff. The function is pure and deterministic, so replay, undo, and export remain reproducible and no hidden per-stroke accumulation state is introduced.

This is an explicit local opacity approximation. It does not claim Photoshop parity for physical wet-media accumulation, tablet pigment simulation, or brush-engine texture dynamics; those remain future work.
