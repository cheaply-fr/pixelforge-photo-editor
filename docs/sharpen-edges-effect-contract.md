# Sharpen Edges effect contract

`Filter → Sharpen → Sharpen Edges` stores an editable `filterEffects` record
with `type: "sharpen-edges"`, bounded `amount` and bounded Gaussian `radius`.
Rendering derives a deterministic local luminance gradient and applies the
source-minus-Gaussian contribution only where that edge weight is present.
Flat regions therefore remain stable while contrast boundaries receive the
sharpen contribution. Source pixels, layer assets, alpha and transparent RGB
padding remain unchanged; clearing or undoing the effect restores prior
metadata.

This is a bounded local approximation rather than Photoshop algorithm parity:
threshold, halo suppression, channel-specific controls and camera-aware
sharpening remain future work. The test contract covers deterministic pixels,
source immutability, flat-region suppression, edge response, alpha and
malformed-bound normalization. Desktop and mobile acceptance covers menu
enablement, editable radius, persistence, source retention and representative
rendered pixels.
