# Mask All Objects contract

`Layer → Mask All Objects` is a bounded, offline proxy for Photoshop's object
mask command. It applies the existing edge-connected background segmentation
algorithm independently to each visible, unlocked raster layer and stores the
result as a canvas-sized nondestructive layer mask.

The command has one undoable history commit. It never rewrites the source
asset, preserves the source's existing alpha and transparent RGB, and stores
mask pixels in the local draft asset table. Only visible unlocked raster
layers are eligible; hidden, locked, vector, text, adjustment and smart-object
layers are left unchanged. If no eligible layer exists, the menu item is
disabled and no history frame is created.

This is intentionally not semantic object detection. It does not infer a
person, product, hair or face boundary, and it does not call a provider or
upload document pixels. The existing color-tolerance setting controls the
edge-connected proxy and its limitations are disclosed in the status notice.
Calculations remain local and are discarded if the document changes before the
single commit can be attached.

The segmentation primitive is covered by the pure background-removal contract.
Browser acceptance covers source preservation, representative edge/subject
mask pixels, undo, lock gating and desktop/mobile execution.
