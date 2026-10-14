# Generic layer links contract

PixelForge supports a bounded local equivalent of Photoshop's ordinary layer
links. `Layer → Link Layers` assigns one validated `layerLinkId` to the
selected unlocked layers, and `Layer → Unlink Layers` removes that identity
from the selected linked layers. `Layer → Select Linked Layers` selects every
ordinary layer sharing any selected identity; smart-object content links remain
separate and continue to use their embedded source identity.

Editing a linked layer's affine matrix applies the same affine delta to its
linked peers. This keeps translation, scale, rotation and skew edits together
while preserving each layer's own asset, opacity, blend, masks and metadata.
The operation is one undoable edit. A locked selected layer or locked
containing group prevents creating a link, and malformed or stale selection
identities fail closed. Unlinking is scoped to the selected layers and never
changes pixels.

The identity and synchronized transforms are versioned in the project JSON and
survive local draft reload and project round trips. No provider-backed linked
files, external asset graphs, nested-link resolution or cloud synchronization
is implied by this contract.

Pure validation and immutability coverage lives in
`tests/layer-links.test.mjs`. Desktop and mobile acceptance covers menu guards,
link creation, synchronized transform pixels/metadata, reload, project export
and unlinking in `tests/browser/layer-links.spec.ts`.
