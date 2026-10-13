# Stylize → Emboss effect contract

PixelForge exposes **Filter → Stylize → Emboss…** as a local, nondestructive directional-relief approximation. The persisted record uses the standard filter envelope `{ type: "emboss", amount, radius, angle, centerX, centerY, seed }`.

- `radius` is bounded to 0–64 and controls the directional sampling depth; `angle` is bounded to −180°…180° and controls the light direction.
- The renderer compares two alpha-aware luminance samples around each visible pixel, converts the signed gradient to a neutral relief value, and blends it by `amount`.
- Canvas dimensions, source assets, alpha bytes, and transparent RGB padding are preserved. The operation is deterministic and replayable after local draft/project round trips.
- This does not claim Photoshop-equivalent material, highlight/shadow, contour, texture, or foreground/background controls; those remain staged.
