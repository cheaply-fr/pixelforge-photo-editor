# AI Sharpen effect contract

`Filter → Sharpen → AI Sharpen…` stores an editable `filterEffects` record with `type: "ai-sharpen"`.

This release is a deterministic on-device approximation. It does not download a model, call a remote inference service, or claim Adobe/Photoshop parity. It combines a fine and broad local luminance reference, applies a bounded high-frequency contribution, and gates low-contrast noise according to the editable suppression control.

## Controls

- `amount`: overall effect strength, normalized to `0..100`.
- `radius`: local reference radius, normalized to `1..64` pixels.
- `aiSharpen.detail`: detail gain, normalized to `0..100` (default `58`).
- `aiSharpen.noiseSuppression`: low-contrast noise suppression, normalized to `0..100` (default `42`).

All values are finite, serializable numbers. Invalid values fall back to bounded defaults. The metadata is included in recorded filter actions and batch replay without retaining pixels or object URLs.

## Safety and persistence

The source buffer is never mutated. Fully transparent pixels preserve their original RGB bytes and alpha; visible pixels retain source alpha. The effect remains nondestructive and editable through the Filter effects inspector, undo/redo, project download, reload, and project import. Work is local and anonymous; no sign-in, payment, network, or model download is required.

## Validation

Pure tests cover normalization, invalid metadata, deterministic output, source immutability, transparent RGB preservation, amount-zero identity, sensitivity to detail/suppression controls, and distinction from Smart Sharpen. Browser tests cover menu enablement, the explicit approximation notice, editable controls, source asset preservation, metadata persistence, reload, and pixel stability on desktop and mobile projects.
