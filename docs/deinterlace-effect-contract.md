# De-Interlace filter contract

`Filter > Video > De-Interlace…` is a local, nondestructive field-reconstruction
approximation. It treats alternating raster lines as one field and rebuilds
the discarded parity from adjacent retained rows. The persisted field control
selects the first (rows 1, 3, 5…) or second (rows 2, 4, 6…) field, while the
reconstruction control chooses alpha-aware interpolation or nearest retained
row duplication. The result blends by the persisted amount control.

The source asset remains immutable. The renderer preserves source alpha and
never imports hidden RGB from transparent samples. `amount: 0` and the legacy
`radius: 0` record are exact detached identities. The editable `deinterlace`
metadata survives undo, local reload and `.pixelforge` round trips; this
feature does not claim motion-adaptive broadcast reconstruction or NTSC colour
decoding.

Pure tests cover both field parities, interpolation and duplication, identity
controls, partial alpha, transparent padding and source immutability. Desktop
and mobile acceptance covers menu activation, both editable controls,
representative pixels, source-asset retention, reload, project round trip and
undo.
