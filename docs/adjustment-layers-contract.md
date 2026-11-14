# Adjustment layer contract

PixelForge adjustment layers are source-free nodes in the ordered layer stack.
They retain the existing `Adjustments` record (Levels, Curves, Hue/Saturation,
Color Balance, Sharpen/Noise, photo finishing and local Filter effects) and
apply that record to the already-rendered composite below the node. The source
layers and their immutable assets remain unchanged.

An adjustment layer is created from **Layer → New Adjustment Layer** or the
Layers panel. It is selected like any other layer, and the existing adjustment
inspector edits its metadata through the same undo history. Layer opacity and
blend mode control the corrected composite when it is composited back into the
stack. Hidden and locked nodes follow the regular layer guards. The node has no
asset, mask or painted geometry and does not expand Reveal All bounds.

Persistence accepts the node in versioned drafts and project exports, rejects a
source asset attached to an adjustment kind, and preserves source-asset
identity across reload and JSON round trips. The renderer uses a frame-space
copy of the current composite, applies the bounded deterministic correction
stack, then composites the result with the node's opacity/blend. Transparent
alpha and hidden RGB bytes remain governed by the existing correction contracts.

The pure contract suite covers source-free validation, malformed-node rejection
and metadata round trips. Desktop and mobile browser acceptance covers adding a
node, representative Levels/Hue pixel changes, source identity, undo, local
reload and project export persistence.

Adjustment layers apply to the composite accumulated below their position in
the stack. They can carry a layer mask: one made from the current selection
(Layers panel or Layer menu) or painted with the Adjustment Brush
(`adjustment-brush-contract.md`), and the adjustment then applies only where
the mask allows, inverted masks included. Photoshop clipping/linked
adjustment scopes and true color-management/bit-depth pipelines remain
separate roadmap items.
