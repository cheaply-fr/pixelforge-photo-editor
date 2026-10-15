# Solarize effect contract

PixelForge exposes **Filter → Stylize → Solarize…** as a local, nondestructive
filter effect. It stores the effect as `filterEffects: { type: "solarize",
amount, radius: 0 }` on the editable layer and applies a bounded channel-wise
solarization approximation at render time.

The implementation preserves the source asset, alpha values and hidden RGB in
fully transparent pixels. `amount` is clamped to `0..100`; zero is an identity
operation and larger values blend toward the deterministic solarized result.
The operation is undoable, survives local draft/project round trips and is
available to anonymous editing.

This is a predictable local tonal approximation, not Photoshop's exact color
management or bit-depth implementation. Semantic or generative behavior is out
of scope. Pure tests cover determinism, source immutability, identity settings,
alpha safety and malformed metadata; desktop/mobile browser coverage verifies
menu availability, editable persistence and source-asset retention.
