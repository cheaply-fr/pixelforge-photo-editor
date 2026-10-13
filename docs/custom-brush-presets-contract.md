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
