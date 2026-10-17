# High Pass effect contract

PixelForge implements `Filter → Other → High Pass…` as a deterministic,
nondestructive local approximation. The effect stores
`filterEffects.type = high-pass` with bounded `amount` (0–100) and `radius`
(0–64px) metadata. Rendering compares each visible source pixel with an
alpha-aware Gaussian reference and emits a neutral-grey edge residual. Source
assets, alpha bytes and transparent RGB padding remain unchanged; undo, reload,
portable projects and recorded filter actions retain the editable parameters.

This is intentionally a local residual renderer, not a claim of Photoshop
blend-mode compositing, channel-specific high-bit-depth processing, halo
suppression or exact Adobe parity. Those controls remain staged behind their
own contracts. Pure pixel/validation tests are in
`tests/high-pass-filter.test.mjs`; desktop/mobile menu, inspector, source
retention and reload coverage is in `tests/browser/filter-effects.spec.ts`.
