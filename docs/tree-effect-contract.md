# Render → Tree effect contract

PixelForge exposes **Filter → Render → Tree…** as a local, nondestructive approximation. The persisted filter record is `{ type: "tree", amount, radius, centerX, centerY, seed, tree: { branches, leafiness } }`.

- `branches` is clamped to 2–8 and `leafiness` to 0–100.
- `radius` controls the root branch length; `centerX` and `centerY` define the normalized root (the UI keeps the root above the lower canvas edge).
- `seed` is an unsigned 32-bit value and makes branch jitter and leaf placement replayable.
- Rendering is deterministic and local: a bounded recursive branch graph and leaf disks are blended over visible source pixels.
- The renderer preserves canvas dimensions, source assets, alpha bytes, and RGB padding for fully transparent pixels. A draft/project round trip therefore reproduces the same pixels without generated assets or uploads.
- This is not Photoshop-equivalent botanical synthesis. Foreground/background colors, exact procedural growth, path/shape controls and wrap-around remain staged.
