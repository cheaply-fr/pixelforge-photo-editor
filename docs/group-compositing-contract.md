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

Folders and layers share one blend catalogue (`src/blendModes.ts`), shown
grouped as Normal; Darken, Multiply, Color Burn, Linear Burn, Darker Color;
Lighten, Screen, Color Dodge, Linear Dodge (Add), Lighter Color; Overlay, Soft
Light, Hard Light, Vivid Light, Linear Light, Pin Light, Hard Mix; Difference,
Exclusion, Subtract, Divide; Hue, Saturation, Color, Luminosity. Stored values
are stable identifiers (`source-over` is Normal). Modes Canvas 2D implements
(`multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`,
`color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`,
`saturation`, `color`, `luminosity`) use the browser compositor. The others
are composited in software with the same W3C source-over equation
(`Cs' = (1 - ab) Cs + ab B(Cb, Cs)`): the layer or folder is rendered once at
Normal/100% into an isolated frame surface, then opacity and the blend are
applied once. Linear Dodge is deliberately software rather than Canvas
`lighter`, because `lighter` also adds alpha and differs for partially
transparent pixels. Soft Light follows the W3C formula. These are local
approximations and are not claimed to match any other editor bit-for-bit.
Because the renderer, worker, export, merge/flatten, PSD and PDF composites all
use `renderFrame`, every path produces the same pixels. Documents saved with
the original seven modes load unchanged; unknown values fail validation. A hidden or zero-opacity folder does not allocate
or render its child surface. Group locks disable folder controls and all member
edits. Folder changes are ordinary document revisions, so undo/redo, local
reload, portable project export and project import preserve the folder and its
children.

The Layers panel's **Layer folder** control uses the same ordering contract as
folder creation: assigning a layer to an existing folder moves that layer next
to the folder's other members before committing the revision. Removing a layer
from a folder leaves its stack position in place and removes the folder when
the layer was its last member, so empty folder metadata cannot accumulate.

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

Nested folders, clipping masks, smart objects, tiled rendering and
multi-selection are separate contracts and are not implied by this milestone.
Vector masks are active on supported child layers; their local path alpha is
evaluated inside the child render pass and remains covered by the separate
[`vector-mask-contract.md`](./vector-mask-contract.md).
