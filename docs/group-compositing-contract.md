# Isolated group compositing contract

PixelForge folders are compositing sources. Every visible member of a folder is
rendered into one frame-sized, transparent surface in layer order. The member
pipeline is unchanged: each child retains its own visibility, opacity, blend
mode, affine transform, raster or vector mask, styles, adjustments and local
cleanup metadata. Source assets remain immutable.

Once the child surface is complete, the renderer applies the folder's
validated `opacity` and `blend` exactly once while drawing it at the first
folder-member stacking slot. Later members of that folder are consumed by the
isolated pass, so a folder blend such as `multiply` or `screen` affects the
flattened overlap rather than each child independently. Non-contiguous members
therefore have deterministic stacking: ungrouped layers between the members
are rendered at their own position after the folder's first-member slot.

`source-over`, `multiply`, `screen`, `overlay`, `darken`, `lighten` and
`difference` are supported. A hidden or zero-opacity folder does not allocate
or render its child surface. Group locks disable folder controls and all member
edits. Folder changes are ordinary document revisions, so undo/redo, local
reload, portable project export and project import preserve the folder and its
children.

The isolated surface is bounded by the same 16-megapixel frame limit as the
document. The renderer uses one additional frame-sized surface per folder and
does not upload pixels or mutate source buffers. Worker cancellation is checked
between top-level layer passes; nested folder work does not emit duplicate
progress events, so reported progress remains monotonic and bounded by the
outer frame's layer count.

The pure RGBA reference equations and bound checks are in
[`tests/group-compositing.test.mjs`](../tests/group-compositing.test.mjs). The
desktop and mobile browser contract covers overlapping pixels, non-contiguous
members, child blend/opacity/transform persistence, visibility, lock guards,
undo/redo, reload, export and import in
[`tests/browser/group-blend.spec.ts`](../tests/browser/group-blend.spec.ts).

Nested folders, vector masks, clipping masks, smart objects, tiled rendering
and multi-selection are separate contracts and are not implied by this
milestone.
