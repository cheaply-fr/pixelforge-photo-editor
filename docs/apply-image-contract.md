# Apply Image contract

`Image → Apply Image…` is a local, undoable compositing command for the active
unlocked raster layer. It renders the current visible document, optionally
clips that source to the current selection, and composites it source-over the
active raster at an explicitly confirmed opacity from 0–100%.

The first implementation requires the active raster asset to match the
document dimensions. Applying the rendered source bakes the active layer's
transform, masks, smart filters and cleanup metadata into one new raster asset;
the notice states that this is intentional and Undo restores the editable
source. No network provider or remote image is involved, and a concurrent
document change aborts without overwriting the newer frame.

Pure coverage verifies source-over alpha math, endpoint opacity, input
immutability and malformed-buffer rejection. Browser coverage exercises the
Image menu on desktop and mobile, prompt cancellation/invalid values,
selection clipping, one undoable commit, and a project round trip.

`Image → Calculations…` shares the same safety boundary and supports the local
`multiply`, `screen`, `add`, `subtract`, `difference`, and `overlay` channel
modes with explicit opacity. It renders the visible source, clips it to an
active selection when present, and bakes the result into the active raster as
one undoable commit. Unsupported modes and invalid opacity are rejected before
rendering.
