# Pointillize filter contract

Pixel's first Pointillize slice is a deterministic bounded stipple-cell approximation. Each cell samples an immutable source colour at its centre and blends that colour into a circular dot coverage; destination alpha and transparent RGB remain source-safe. The result stays nondestructive and editable through the ordinary `filterEffects` metadata.

The effect stores `filterEffects.type = pointillize` with bounded amount, radius (cell size), centre and seed metadata. Amount controls dot coverage and radius controls cell size. It never expands the canvas or changes source assets, and it remains local/offline.

Unit tests cover deterministic cell output, amount/radius identities, cell edges, transparent-source exclusion, detached buffers and local Action allow-list/replay round trips. Desktop/mobile acceptance covers menu activation, cell-size editing, representative pixel changes, source retention, reload, project round trips, undo and recording/replaying a Pointillize Action recipe. The replay path invokes the same validated command and history guards as a direct menu action; recipes persist only bounded command metadata and never generated pixels.

Density controls, foreground/background colour, crystallize/facet/fragment/mezzotint variants and Photoshop's full Pointillize dialog remain planned. This contract does not claim Photoshop equivalence.
