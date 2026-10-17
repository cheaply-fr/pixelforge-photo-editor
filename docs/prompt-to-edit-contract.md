# Local Prompt to Edit contract

PixelForge exposes **Edit → Prompt to Edit…** as a bounded offline command parser over the existing nondestructive adjustment model. It is a convenience workflow for common tonal edits, not a semantic image-generation service.

## Behaviour

- The dialog accepts at most 240 characters and recognizes an allow-listed set of local intents: brighten/darken, contrast, saturation/desaturation, grayscale, warm/cool, green/magenta tint, hue rotation, sharpen and soften.
- A request can combine at most four intents. Strength values are clamped to bounded adjustment ranges, and reset is available only as an explicit standalone request.
- Applying a plan updates editable adjustment metadata in one undoable layer edit. Source assets, alpha, masks and layer identity remain unchanged, and the project persists the result through reload and portable export.
- The prompt and generated plan stay in browser memory/draft metadata. No image, prompt, account data, model call or provider request is made.

## Deliberate limits

Unknown language, object descriptions, scene understanding, semantic replacements, generative synthesis and provider-backed inference fail closed. The parser does not claim Adobe Photoshop equivalence or understand arbitrary natural language. Those capabilities remain staged behind explicit privacy, authorization, quota, resource, cancellation and failure contracts.

## Evidence

- Parser bounds, deterministic plans, combined intents, reset and rejection cases: `tests/prompt-to-edit.test.mjs`.
- Desktop/mobile dialog, local adjustment pixels through the editable model, reload round trip, unsupported prompt and lock guard: `tests/browser/prompt-to-edit.spec.ts`.
