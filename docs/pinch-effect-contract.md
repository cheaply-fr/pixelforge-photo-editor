# Local Pinch effect contract

PixelForge's **Filter → Distort → Pinch…** command is a bounded,
nondestructive local radial warp. It stores only the validated
`adjustments.filterEffects` record on the selected layer; the immutable raster
asset, layer transform and masks remain unchanged.

`amount` is a 0–100 inward pull strength, `radius` is a 1–64 normalized
influence control, and `centerX`/`centerY` are normalized 0–1 coordinates. The
renderer converts the radius to `radius / 64 × 70 %` of the shorter source
dimension (the panel reads **Pinch radius** in percent of the shorter side, not
pixels) and uses a squared falloff so the edge of the influence is continuous.
Each destination samples `1 + amount × falloff²` times farther from the centre,
so content is pulled in toward the centre (earlier builds sampled nearer the
centre, which magnified instead of pinching). Each output
pixel inverse-maps into the source with deterministic premultiplied-alpha
bilinear sampling. This avoids tiny-canvas no-op remaps caused by
nearest-neighbour rounding and prevents RGB hidden behind transparent pixels
from bleeding into visible edges. It reads only the source buffer, keeps the
destination alpha byte unchanged, and leaves fully transparent RGB padding
untouched when a sample has no coverage.

The pure suite covers bounded metadata, source immutability, deterministic
repeatability, identity at zero amount, centre stability, representative
neighbour remapping, transparent RGB preservation and validation. The
desktop/mobile browser acceptance covers enabled menu activation, accessible
centre/radius controls, representative pixel and alpha output, undo, local
reload, project import/export and immutable source-asset retention.

This is a local radial pinch primitive. Displace maps, Spherize, Shear, Wave,
ZigZag, mesh interpolation, GPU acceleration and Photoshop algorithm parity
remain separate roadmap items.
