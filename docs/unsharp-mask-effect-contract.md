# Unsharp Mask effect contract

`Filter → Sharpen → Unsharp Mask…` stores an editable `filterEffects` record
with `type: "unsharp-mask"`, bounded `amount` and bounded blur `radius`.
Rendering builds a deterministic Gaussian reference from the immutable source,
then adds the source-minus-reference high-frequency contribution to visible
RGB channels. Source pixels, layer assets, alpha and transparent RGB padding
remain unchanged; clearing or undoing the effect restores the prior metadata.

This is a local nondestructive approximation. Threshold, halo suppression,
channel-specific controls, camera-aware sharpening and Photoshop algorithm
parity remain future work. The unit contract covers deterministic pixels,
source immutability, alpha/transparent padding and malformed-bound
normalization. Desktop and mobile acceptance covers menu enablement, editable
radius, persistence, source retention and representative rendered pixels.
