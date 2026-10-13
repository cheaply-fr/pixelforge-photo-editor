# Artboard smart-object replacement contract

Pixel supports a bounded local replacement workflow for an embedded smart
object when a named artboard is active. The Artboard controls expose
**Replace smart object and fit**. The selected browser-readable image becomes
the same smart-object layer's new embedded source, then the existing
source-safe Cover placement planner fits its painted bounds into the active
artboard and adds the layer to that artboard's explicit membership list.

The operation is one immutable history commit. It preserves the layer ID,
smart-object kind, source label, groups, masks, opacity, blend mode and the
previous frame; Undo restores the prior source and matrix. Locked layers and
artboards are rejected before mutation. The replacement remains local and
anonymous: the source is embedded in the portable draft, no network upload is
performed, and the source image is never overwritten.

This is a content replacement and Cover-fit contract, not Photoshop's linked
smart-object, PSD, nested-filter-graph or content-aware frame semantics.
Those capabilities remain separately staged. Desktop and mobile acceptance
cover replacement, matrix placement, membership and reload persistence in
`tests/browser/smart-objects.spec.ts`; existing pure fit geometry and
artboard validation remain in `tests/artboards.test.mjs`.
