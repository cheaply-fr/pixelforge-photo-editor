# Local Spherize effect contract

PixelForge's **Filter → Distort → Spherize…** command is a bounded,
nondestructive local radial warp. It stores only the validated
`adjustments.filterEffects` record on the selected layer; the immutable raster
asset, layer transform and masks remain unchanged.

`amount` is a 0–100 bulge strength, `radius` is a 1–64 normalized influence
control, and `centerX`/`centerY` are normalized 0–1 coordinates. The renderer
maps each output pixel back into the source with a smooth quadratic falloff
inside a radius of `radius / 64 × 70 %` of the shorter source dimension (the
panel reads **Spherize radius** in percent of the shorter side). Records carry
`relativeRadius: true`; legacy records without it ignored `radius` and always
used 70 %, so they normalize to radius 64 and render as before. New Spherize
records start at radius 64. The centre is
an exact identity point and the influence boundary returns to the original
coordinate, so moving the centre or changing the radius cannot warp pixels
outside the bounded region. Spherize uses deterministic premultiplied-alpha
bilinear sampling; transparent source pixels keep their alpha and hidden RGB
padding does not bleed into visible edges.

The operation reads only the immutable source buffer and returns a detached
buffer. Amount zero is an exact identity, malformed dimensions and metadata
are rejected or safely normalized, and the validated effect survives undo,
local draft reload and editable project export/import without baking pixels
into the source asset.

The pure suite covers bounded metadata, source immutability, deterministic
repeatability, centre and outside-region identity, representative remapping,
transparent RGB preservation, zero-strength identity and validation. Desktop
and mobile browser acceptance covers menu enablement, accessible radius and
centre controls, representative output and alpha, source-asset retention,
undo, local reload and project round trips.

This is a local radial primitive. Photoshop's separate mesh, lens and
content-aware distortions remain independent roadmap items.
