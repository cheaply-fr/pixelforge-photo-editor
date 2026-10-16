# AI Sharpen effect contract

`Filter → AI Sharpen…` is a private, deterministic local approximation. It
does not call a hosted model and does not upload image pixels.

- Visible pixels use a bounded spatially weighted luminance neighbourhood. A
  threshold suppresses low-frequency changes, while high-frequency luminance
  detail is boosted and the source chroma is retained.
- Radius is clamped to `1..6`, edge threshold is an integer in `0..255`
  (default `22`), and amount is `0..100`. Alpha is copied byte for byte;
  fully transparent pixels retain hidden RGB padding; source asset bytes are
  never mutated.
- The effect is stored as editable `filterEffects` metadata and survives
  Action serialization, undo, reload, project export/import, and bounded batch
  replay. Locked or unavailable layers remain unchanged through the normal
  command guard.
- This contract does not claim Photoshop's model-backed RAW priors,
  deconvolution, camera-aware sharpening, high-bit-depth processing or neural
  filter parity. Those capabilities require a separate privacy, capability,
  resource and provider evaluation before activation.

Pure tests cover deterministic edge enhancement, flat-field identity,
alpha/transparent-RGB safety, normalization and Action defaults. Desktop/mobile
acceptance covers the enabled menu command, disclosure text, editable
controls, source identity, reload and project round trips.
