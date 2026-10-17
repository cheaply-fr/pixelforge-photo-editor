# AI Denoise effect contract

`Filter → AI Denoise…` is a private, deterministic local approximation. It
does not call a hosted model and does not upload image pixels.

- Visible pixels are sampled in a bounded neighbourhood in Y'CbCr space. A
  spatial weight and luminance-range weight protect strong edges while the
  chroma channels receive a stronger smoothing mix than luminance.
- Radius is clamped to `1..6`, edge protection is an integer threshold in
  `0..255` (default `18`), and amount is `0..100`. Alpha is copied byte for
  byte; fully transparent pixels retain their hidden RGB padding; source asset
  bytes are never mutated.
- The effect is stored as editable `filterEffects` metadata and survives
  Action serialization, undo, reload, project export/import, and bounded batch
  replay. Locked or unavailable layers remain unchanged through the normal
  command guard.
- This contract does not claim Photoshop's model-backed RAW priors, temporal
  multi-frame denoising, high-bit-depth processing, camera profiles or neural
  filter parity. Those capabilities require a separate privacy, capability,
  resource and provider evaluation before activation.

Pure tests cover deterministic pixels, edge retention, alpha/transparent-RGB
safety, normalization and Action defaults. Desktop/mobile acceptance covers
the enabled menu command, disclosure text, editable controls, source identity,
reload and project round trips.
