# Polar Coordinates filter contract

Pixel's first Polar Coordinates slice is a deterministic, nondestructive rectangular-to-polar remap. Each destination pixel converts its angle around the editable centre into a source X coordinate and its bounded radial distance into a source Y coordinate. Source pixels are sampled with premultiplied-alpha bilinear interpolation; destination alpha and transparent RGB remain source-safe.

The effect stores the normal `filterEffects` metadata (`type = polar-coordinates`, `amount`, `radius`, `centerX`, `centerY`, `seed`) and survives draft reload plus project export/import. Radius controls the normalized radial extent — the full source height is reached at `radius / 64 × 50 %` of the shorter side, which the panel shows as **Polar radius** in percent of the shorter side — and amount blends the remap with the identity. Coordinates clamp to the image bounds, so the first stage does not allocate a larger canvas or wrap the seam.

Unit tests cover deterministic output, amount/radius identity, centre and corner mapping, transparent-source exclusion, detached buffers and malformed dimensions. Desktop/mobile acceptance covers menu activation, editable controls, representative pixel changes, immutable source assets, reload, project round trips and undo.

Polar-to-rectangular mode, seam interpolation, canvas expansion, true geometric layer deformation and Photoshop's full option set remain planned. This contract does not claim Photoshop equivalence.
