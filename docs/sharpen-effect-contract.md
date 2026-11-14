# Sharpen effect contract

`Filter → Sharpen → Sharpen` is a one-click, nondestructive local filter. It
stores `filterEffects.type = "sharpen"` with the shared envelope; only
`amount` (0–100) affects the result.

The renderer applies one fixed 3 × 3 kernel — centre 5, the four edge
neighbours −1 — to visible RGB and blends the result with the source by
`amount`. It has no radius: the Filter effects panel shows only Effect
amount, and any stored `radius` is ignored. Neighbours outside the image
repeat the edge pixel and transparent neighbours count as the centre colour,
so hidden RGB never leaks in. Alpha and the RGB of transparent pixels are
kept; the source asset is never changed.

Earlier builds rendered Sharpen with the same Gaussian-reference calculation
as Unsharp Mask; saved Sharpen records now render with the fixed kernel.
Unsharp Mask (Gaussian reference, editable radius) and Sharpen More (two
Gaussian unsharp passes, see `sharpen-more-effect-contract.md`) are
unchanged.

This is a local approximation of a fixed sharpening kernel and does not claim
Photoshop's exact Sharpen arithmetic. Pure coverage is in
`tests/filter-effects.test.mjs` and `tests/filter-audit-fixes.test.mjs`;
desktop/mobile menu coverage is in `tests/browser/filter-effects.spec.ts`.
