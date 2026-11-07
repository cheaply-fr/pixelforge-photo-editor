# Custom brush presets contract

`Edit → Define Brush Preset…` captures the current local brush settings into a
named preset stored in the anonymous draft settings. Presets contain only
bounded brush values (size, hardness, spacing, angle, roundness, pressure
flags, smoothing, scatter, texture, dual-tip, bristle and flow); they never
contain pixels, credentials or remote references. A maximum of 32 presets is
kept, duplicate IDs are rejected during migration, and malformed entries fail
draft validation rather than being executed.

The saved-preset selector is available for Brush and Pencil, applies all
captured settings, survives reload and portable project export, and remains
local-first. Empty names are rejected before a draft or history change. Pure
tests cover validation, normalization, trimming, duplicates and the bound;
desktop/mobile acceptance covers authoring, invalid input, project export and
reload.

## Preset library, built-ins and device storage (2026-11-07)

Branch `feat/brush-color-dynamics-presets`. Brush and Pencil options show a
**Saved brush preset** library with four built-in space-art presets (**Star
field**: 4 px hard dabs, 400% spacing, 1,000% scatter, Count 6 with count,
size, opacity, hue, saturation and brightness jitter; **Soft glow**: 220 px,
0% hardness, 12% opacity; **Dust / nebula**: scattered soft dabs with opacity,
size, slight hue and foreground/background jitter; **Smoke wisp**: soft, 18%
opacity, size/opacity jitter and smoothing) followed by the presets saved on
this device. **Save brush preset** (same as `Edit → Define Brush Preset…`),
**Rename brush preset** and **Delete brush preset** (with confirmation) act on
saved presets only; built-ins cannot be renamed or deleted. Presets now also
capture brush opacity (optional; older presets keep the current opacity) and
colour dynamics.

Saved presets are written to `localStorage` under
`pixelforge.brush-presets.v1` (a versioned envelope) so they are available in
new documents on the same device, and they still travel in drafts and
`.pixelforge` projects as `settings.customBrushPresets`. Opening a draft or
project merges its presets into the device library (device copy wins on
duplicate IDs, newest 32 kept). Unavailable, full or corrupt storage falls back
to the built-ins and never blocks editing. There is no cloud sync. The editor
has no custom (sampled) brush tip shapes, so no 4-point “Glint” tip is
included. Evidence: `src/brushPresetLibrary.ts`,
`tests/brush-preset-library.test.mjs` and
`tests/browser/brush-color-presets.spec.ts` on desktop and mobile.
