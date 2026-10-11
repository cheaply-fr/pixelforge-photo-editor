# Vector mask contract

PixelForge vector masks are editable, nondestructive local paths attached to a
visible pixel-producing layer. Raster, embedded Smart Object, text, rectangle,
ellipse, line, polygon and path layers may carry one mask. Adjustment layers
are excluded because their existing canvas-sized alpha masks already define
their correction scope.

The mask stores a validated `PathModel`, `enabled` and `inverted` flags. The
path must contain at least one closed filled contour with at least three nodes;
compound contours use the path's `nonzero` or `evenodd` fill rule. Cubic
handles are preserved for Direct Selection editing, while path strokes are
ignored for mask alpha. The bounded safety limits are 10,000 total nodes and
64 contours per mask. A default mask is a rectangle covering the layer's
local bounds.

Rendering first composites the layer without its mask, traces the path in
layer-local coordinates through the layer's affine transform, and multiplies
the resulting alpha. Inversion complements that alpha; disabling the mask
returns the unmasked layer. Layer opacity and blend mode are applied once by
the outer compositor. Source PNG assets and editable layer metadata remain
unchanged, including transparent hidden RGB values.

The Layers panel and Layer menu expose create, invert, disable/enable and
remove actions. Direct Selection edits the mask path after creation. Actions
are guarded for hidden or locked layers, are undoable, and preserve the path
when a mask is disabled or removed. Existing clipping and folder compositing
continue to use their own validated relationships; a vector mask can be used
on a clipped layer and is evaluated inside that layer's render pass.

Pure coverage in `tests/vector-mask.test.mjs` and
`tests/vector-mask-validation.test.mjs` checks contour/node limits, compound
fill rules, alpha multiplication and inversion, source immutability, model
validation on every supported layer kind, malformed metadata, and JSON
round-trips. `tests/browser/vector-mask.spec.ts` covers create/edit/invert,
disable/remove, undo and reload, transformed compound holes, malformed import
retention, locked/hidden guards, and worker parity on desktop and mobile.

This is a bounded local vector-mask workflow, not Photoshop-compatible PSD
mask interchange, semantic selection, GPU compositing or unlimited document
capacity. Those remain separate roadmap work.
