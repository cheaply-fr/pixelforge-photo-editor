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
