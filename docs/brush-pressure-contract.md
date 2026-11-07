# Brush pressure curve contract

Brush, Pencil, Eraser, Clone, Healing and Pattern Stamp expose a local
**Pressure curve** preference with `Linear`, `Soft` and `Firm` values. The
setting is persisted in the versioned draft/project settings and applies only
when pressure affects size or opacity is enabled. Pen and touch pressures are
normalized to `0..1`; mouse and missing/zero touch pressure retain the existing
full-pressure fallback.

`Linear` uses the normalized pressure, `Soft` uses its square root to make low
pressure more visible, and `Firm` uses its square to reserve response for
firmer contact. Values are clamped and deterministic, and the curve never
changes the source asset or creates history by itself. Legacy drafts and custom
brush presets without the field normalize to `Linear`; malformed curve names
are rejected at project validation.

This is a bounded local pressure response, not a claim of tablet-driver
calibration, tilt/rotation sensing, velocity response or Photoshop parity.
Physical pen/touch acceptance and device-specific latency budgets remain part
of the scale/accessibility release gate.

## Pen lift (2026-11-07)

A pen reporting pressure `0` was previously treated like a missing reading
(full pressure). It is now kept as `0`: with **Pressure affects size** or
**Pressure affects opacity** enabled, a normalized pressure at or below `0.01`
is a pen lift and the dab paints (or erases) nothing, for every curve; each
curve already maps `0` to `0`. With both options off, pen pressure is ignored as
before. Mouse input always uses full pressure, and touch pressure `0` keeps the
full-pressure fallback because many touch screens report `0` when they cannot
sense force. Pointer-up still reuses the last in-stroke pressure.

Evidence: `src/brush.ts` (`normalizeBrushPressure`, `isBrushPenLift`),
`tests/brush-pen-lift.test.mjs`, and the desktop/mobile Playwright case in
`tests/browser/brush-gradient-options.spec.ts` where a pen stroke at pressure 0
leaves the layer blank and the same stroke at pressure 1 paints.
