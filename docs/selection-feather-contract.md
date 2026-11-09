# Selection Feather contract

`Select > Modify > Feather…` edits the persisted selection's `feather` value
from 0 through 1,000 px. Decimal radii are accepted with 0.1 px precision
(for example `1.2`; a decimal comma such as `1,2` is also accepted) and stored
as a plain number, so no migration is needed. Rendering applies a Gaussian
alpha blur whose standard deviation is the radius when the selection is used
for a mask, fill, cleanup or export; source image pixels remain unchanged.
Below 16 px the blur is a pure three-pass extended box filter (`featherAlpha`
in `src/selectionFeather.ts`), so fractional radii are honoured exactly instead
of being quantised by the browser's canvas `blur()` (Chromium renders 1.0–1.3
px identically); its cost does not grow with the radius. From 16 px up the
canvas `blur()` filter is kept, where its quantisation is small relative to the
radius and existing documents keep their previous output.
The value survives undo, local draft reload and `.pixelforge` round trips.

The command is disabled without an active selection, rejects malformed or
out-of-range input, and makes one history entry only when the value changes.
The existing panel control (0–100 px slider in 0.1 px steps) and the menu
dialog share the same validated setter; Select and Mask's feather field uses
the same decimal parser.
This is a bounded local blur contract, not Photoshop-equivalent Select and Mask
edge reconstruction.
