# Local Generative Fill contract

PixelForge exposes **Edit → Generative Fill…** as a bounded offline approximation for anonymous editing. It is deliberately separate from provider-backed semantic generation.

## Behaviour

- The dialog accepts a short prompt, radius, opacity and deterministic seed. The prompt is retained only in the editable draft metadata; it is never uploaded or sent to a model.
- Apply requires a current selection and a visible, unlocked raster layer. The operation samples seeded context rings outside the selected mask and blends the result into the selection. Alpha and the immutable source asset remain intact.
- The operation is undoable, reload-safe and portable through the existing content-aware fill data model. Up to eight local texture fills are allowed per layer, and prompt/radius/seed values have explicit bounds.
- The operation is available without sign-in or payment and does not require a network connection or provider credentials.

## Deliberate limits

This contract does not claim semantic object understanding, prompt-following image synthesis, Adobe Photoshop parity, model-backed inference, or a remote provider integration. Those capabilities remain staged until privacy, authorization, quota, resource, cancellation, and failure contracts are defined and independently validated.

## Evidence

- Pure validation and deterministic/source/alpha safety: `tests/generative-fill.test.mjs`.
- Desktop and mobile dialog, guard, apply, source retention and project round trip: `tests/browser/generative-fill.spec.ts`.
- The full release gate must still include protected GitHub checks, merge/deployment revision evidence and independent live verification.
