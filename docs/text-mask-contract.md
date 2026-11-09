# Type Mask contract

Pixel's **Type > Horizontal Type Mask** and **Vertical Type Mask** commands
create a full-canvas alpha selection from the active editable text layer. The
text remains an editable layer: the command renders a temporary orientation
clone through the local Canvas 2D renderer and stores only the resulting alpha
in the existing `Selection.mask` PNG asset.

The Horizontal and Vertical Type Mask **tools** reuse this pipeline with a
temporary text entry instead of an existing layer and add no layer; see
[`type-tools-contract.md`](./type-tools-contract.md).

The command is available only for a visible, unlocked, non-empty text layer.
Group visibility and locks are honoured. Canvas dimensions, content length and
affine transforms are validated before allocation (maximum 16 million pixels
and 10,000 characters). Replace, Add, Subtract and Intersect use the existing
selection composition pipeline, and the result is one undoable history commit.

The layer's text, orientation, font metadata, transform and source assets are
unchanged. Selection masks are therefore preserved by local draft reload and
project export/import through the normal document schema. The implementation
is an offline Canvas 2D approximation: OpenType vertical shaping, punctuation
alternates, type-on-path layout and semantic text-to-path conversion remain
separate roadmap items.

Pure tests cover request limits, alpha extraction/packing, bounds and immutable
buffers. Browser acceptance covers menu state, mask pixels, orientation,
selection operations, metadata preservation, undo and project round trips on
desktop and mobile viewports.
