# Flame filter contract

PixelForge's **Filter → Render → Flame…** command is a local,
nondestructive procedural approximation. It stores
`filterEffects.type = flame` on the selected layer and regenerates the
preview from the immutable source asset on every render; generated pixels are
never persisted as a replacement asset.

The renderer builds a deterministic rising warm plume from bounded bilinear
value-noise octaves, a seeded lick field and an authored origin. `radius`
(1–64) controls flame detail, `centerX`/`centerY` control the plume origin,
`amount` controls the blend and the unsigned `seed` makes the result repeatable.
Visible source alpha and fully transparent RGB padding remain byte-for-byte
unchanged, image bounds never expand, and amount/radius zero are detached
identity operations. The same pure algorithm is used by the main-thread and
worker render paths when the effect is eligible for tiled rendering.

This first slice labels its limits: it does not claim Photoshop's exact
path/shape generation, foreground/background colour controls, frame rendering,
physically based turbulence, GPU implementation, or production colour-management
parity. It is an offline local approximation suitable for editable projects and
allow-listed Actions.

The contract requires deterministic repeatability, seed/detail/origin
variation, amount/radius identities, transparent and partial-alpha edges,
source immutability, malformed metadata rejection, project round trips and
Action allow-list/replay. Browser acceptance covers the Render menu command,
editable controls, local-draft reload and project export/import on desktop and
mobile viewports.
