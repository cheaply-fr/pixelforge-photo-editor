# Difference Clouds filter contract

PixelForge's **Filter → Render → Difference Clouds** command is a local,
nondestructive procedural approximation. It stores
`filterEffects.type = difference-clouds` on the selected layer and replays the
effect from the immutable source asset on every render; generated pixels are
never persisted as a replacement asset.

The renderer builds a deterministic four-octave value-noise field from the
persisted unsigned `seed`. `radius` (1–64) controls the cloud scale and
`amount` (0–100) blends the generated field through a per-channel difference
operation with the source. Source alpha and fully transparent RGB padding are
preserved byte-for-byte, image bounds never change, and amount/radius zero are
identity operations that still return a detached buffer. The same pure
algorithm runs in the main-thread and worker render paths.

This first slice intentionally labels its limits: it does not claim Photoshop's
exact stochastic noise, foreground/background colour controls, seamless
wrap-around, GPU implementation or production colour-management parity. It is
an offline local approximation suitable for editable projects and Actions.

The contract requires coverage for deterministic repeatability, seed and scale
variation, amount/radius identities, transparent and partial-alpha edges,
source immutability, malformed metadata rejection, project round trips and
Action allow-list/replay. Browser acceptance covers the Render menu command,
editable controls, undo, local-draft reload and project export/import on the
desktop/mobile viewport matrix.
