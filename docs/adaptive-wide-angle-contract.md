# Adaptive Wide Angle contract

PixelForge exposes `Filter → Adaptive Wide Angle…` as a local, nondestructive
geometry effect. It stores `type: "adaptive-wide-angle"`, the shared bounded
`amount`, `radius`, `centerX` and `centerY` values, and an
`adaptiveWideAngle` object with integer `horizontal` and `vertical` line-bias
values from 0 to 100.

The renderer applies separate horizontal and vertical radial fields and a
small cross-axis term, using alpha-aware bilinear source sampling. The source
asset and transparent RGB padding remain unchanged; only visible output pixels
are rendered through the effect. Reapplying the same metadata is deterministic,
and changing either bias changes the geometry map.

This is a bounded browser-local approximation. It does not claim Photoshop's
constraint drawing, camera calibration, lens profiles, full perspective mesh,
or chromatic-aberration correction. Those capabilities remain staged behind
separate contracts and device/performance tests.

Pure coverage is in `tests/adaptive-wide-angle-filter.test.mjs`. Desktop/mobile
menu selection, editable controls, source retention, pixel change and reload
round-trip coverage is in `tests/browser/filter-effects.spec.ts`.
