# AI Denoise effect contract

`Filter → AI Denoise…` is an explicitly bounded, deterministic on-device approximation. It is a two-scale edge-aware kernel that smooths low-variance colour noise while protecting luminance detail. It is not a downloaded model, a provider call, or Adobe Photoshop/Camera Raw AI parity.

The effect stores only validated metadata on the layer:

- `type: "ai-denoise"`
- `amount: 0..100`
- `radius: 0..64` (the renderer clamps its active neighbourhood to `1..8`)
- `aiDenoise.detail: 0..100`
- `aiDenoise.chroma: 0..100`

Rendering is source-safe: the immutable source asset remains in the project, alpha bytes remain unchanged, and RGB bytes under transparent pixels are not sampled or overwritten. Amount `0` is an identity operation and does not create a meaningful filter result. The implementation is deterministic for a given source and metadata, so local drafts and portable project files render the same result after reload.

No image data leaves the device and the effect does not require authentication, a model download, or network access. Exact neural inference, temporal denoise, RAW/high-bit-depth processing, camera profiles, and Adobe-compatible output remain staged roadmap work. The current renderer uses the editor's existing dimension and tile/worker budgets; it does not claim unlimited-image or Photoshop-equivalence support.

The release gate includes metadata normalization/validation, malformed-settings rejection, deterministic representative-pixel and alpha tests, source immutability, transparent-padding safety, parameter sensitivity, project reload and export round trips, and desktop/mobile browser coverage for the menu command and controls.
