# Selection Feather contract

`Select > Modify > Feather…` edits the persisted selection's `feather` value
from 0 through 1,000 px. Rendering applies the alpha blur when the selection is
used for a mask, fill, cleanup or export; source image pixels remain unchanged.
The value survives undo, local draft reload and `.pixelforge` round trips.

The command is disabled without an active selection, rejects malformed or
out-of-range input, and makes one history entry only when the value changes.
The existing panel control and the menu dialog share the same validated setter.
This is a bounded local blur contract, not Photoshop-equivalent Select and Mask
edge reconstruction.
