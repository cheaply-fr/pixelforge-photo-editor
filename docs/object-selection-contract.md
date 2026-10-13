# Object Selection contract

`Select → Object Selection…` is a local, bounded proxy for Photoshop's Object
Selection workflow. The user supplies a canvas-space click, colour tolerance
and edge softness. PixelForge grows a four-connected opaque region from that
sample and stores the resulting alpha mask in the normal selection model.

The operation is deterministic, source-safe and offline. It preserves partial
source alpha, supports the existing replace/add/subtract/intersect selection
composition, and survives undo, local reload and project export. The result is
an editable mask, not semantic object recognition: hair, disconnected pieces,
complex gradients and perspective-aware inference remain outside this contract.

Pure coverage checks connected-region boundaries, partial alpha, soft edges,
source immutability and invalid inputs. Desktop/mobile acceptance checks the
menu path, persisted mask and reload behavior.
