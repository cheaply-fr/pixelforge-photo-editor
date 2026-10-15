# Neural Filters effect contract

`Filter → Neural Filters…` is an enabled, nondestructive local approximation
for anonymous/offline editing. It is intentionally not a claim of Adobe Neural
Filters parity and it does not load a model or send pixels to a service.

## Persisted metadata

The selected raster layer stores:

```json
{
  "type": "neural-enhance",
  "amount": 85,
  "radius": 2,
  "neuralEnhance": {
    "luminance": 52,
    "color": 38,
    "texture": 56
  }
}
```

All values are bounded to the editor's normal filter ranges. Action recording
and batch replay serialize the same small metadata object; no image bytes,
object URLs, credentials or model files are recorded.

## Pixel behavior

The deterministic renderer samples only visible neighbours in a bounded local
window. It combines three editable contributions:

- luminance recovery increases local separation around the neighbourhood mean;
- colour balance reduces local channel casts while retaining colour contrast;
- texture detail adds a bounded high-pass residual from the same visible window.

The result is blended by `amount`. Alpha bytes and RGB padding under fully
transparent pixels remain unchanged, the source asset remains immutable, and
the same input/metadata always produces the same output. Setting amount to zero
is a no-op.

## Explicit limits

There is no model-backed semantic selection, portrait relighting, depth map,
style transfer, face-aware retouching, generative fill, GPU inference or
Adobe-compatible model output. Those capabilities require separate product,
privacy and performance contracts before they can be enabled.
