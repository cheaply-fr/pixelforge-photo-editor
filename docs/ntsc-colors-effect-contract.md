# NTSC Colors effect contract

`Filter > Video > NTSC Colors` is a local, nondestructive composite-envelope
chroma limiter. It measures gamma-encoded RGB using the documented Y'IQ
coefficients below, then reduces chroma toward equal-channel gray only when
the composite envelope would exceed the normalized `[0, 1]` signal range.
The operation keeps Y' and chroma direction within byte-rounding tolerance.
It is a deterministic, conservative local approximation, not an NTSC encoder,
decoder, receiver simulation, ICC conversion, or broadcast-compliance check;
it does not model setup, bandwidth, phase, composite artifacts, or a specific
Photoshop release. The inspector states this limitation next to the effect.

For normalized gamma-encoded RGB `(r, g, b)`:

```text
Y' =  0.299r + 0.587g + 0.114b
I  =  0.596r - 0.274g - 0.322b
Q  =  0.211r - 0.523g + 0.312b
C  = sqrt(I² + Q²)
```

The envelope is `[Y' - C, Y' + C]`. Pixels already inside it are preserved
exactly. Pixels outside it are moved toward gray by the minimum scale that
leaves one byte of rounding headroom at the signal boundary. The amount field
blends from the original toward that limited result; `0` is an exact detached
identity and `100` applies the full limiter. The control is persisted as
`FilterEffects.amount`; unrelated radius, angle, centre and seed values do not
change the result. Alpha is unchanged and fully transparent pixels retain
their hidden RGB. The source asset is immutable.

The renderer is O(pixels), uses constant scratch space and writes into the
single output buffer already allocated by the filter pipeline. Dimensions and
buffer bounds are validated by the shared renderer before pixel processing.
No device memory budget is inferred from the local benchmark; large-image and
mobile-device limits remain governed by the shared render safety caps and
require device-specific measurement.

Pure tests cover primaries/secondaries, safe and neutral exact identities,
the sampled RGB cube, luma tolerance, chroma reduction, amount blending,
partial alpha, hidden transparent RGB, deterministic output, source
immutability, malformed buffers, effect normalization, and Action metadata.
Desktop and mobile browser acceptance covers both the main-thread fallback
and worker renderer, locked/hidden layer guards, editable effect metadata,
source asset retention, undo/redo, local draft reload, portable project import,
and decoded PNG export pixels. These tests establish the stated local contract;
they do not establish Photoshop visual parity or broadcast compliance.
