# Reflection Removal effect contract

`Edit -> Reflection Removal…` is an enabled, local and nondestructive filter
for small bright glare-like defects. It is deliberately a bounded approximation
that can be explained to users and tested deterministically.

## Behavior

- The effect is stored as `filterEffects.type: "reflection-removal"` with the
  existing `amount` control plus `radius` (1–8 px) and `threshold` (0–255).
- Visible pixels that are bright, low-saturation luminance outliers are blended
  toward the median of their visible neighbours inside the radius.
- Source assets, alpha bytes and RGB bytes in transparent padding remain
  unchanged. The rendered result is the same canvas size and remains editable
  through undo, reload, project export/import, action replay and batch actions.
- The operation is deterministic and does not upload pixels or call an AI
  provider.

## Limits

This is not semantic reflection detection, material or scene reconstruction,
inpainting, object removal, or Photoshop-equivalent glare recovery. It can
leave coloured, broad, textured or non-local reflections unchanged and may
soften an intentionally bright neutral detail. Those capabilities require a
separate opt-in contract with explicit privacy, performance and failure tests.

The local approximation is the supported behavior for this menu item; the UI
labels it as such instead of implying a remote or generative operation.
