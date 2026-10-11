# De-Interlace filter contract

`Filter > Video > De-Interlace…` is a local, nondestructive field-reconstruction
approximation. It treats alternating raster lines as one field and rebuilds
odd lines from the matching pixels above and below them. The operation is
bounded to an 8-line sample distance and blends the result by the persisted
amount control.

The source asset remains immutable. The renderer preserves source alpha and
never imports hidden RGB from transparent samples. `amount: 0` and `radius: 0`
are exact detached identities. The editable `deinterlace` metadata survives
undo, local reload and `.pixelforge` round trips; this feature does not claim
motion-adaptive broadcast reconstruction or NTSC colour decoding.

Pure tests cover deterministic field reconstruction, identity controls,
partial alpha, transparent padding and source immutability. Desktop and
mobile acceptance covers menu activation, representative pixels, source-asset
retention, reload, project round trip and undo.
