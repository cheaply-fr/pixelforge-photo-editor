# Editable layer milestone — version 2

Version 2 replaces flattened history with frames containing dimensions, an ordered layer stack and an active layer ID. Frames may also retain bounded `imageSize` print metadata (resolution and pixels-per-inch/centimeter units); legacy frames default to 72 ppi on open. Raster pixels are immutable PNG assets referenced by ID. Duplicate layers and metadata changes share the same asset. Text, rectangular shapes, elliptical shapes, line segments and regular polygons are rendered from editable properties. Text layers retain multiline content, typeface, weight, editable box width, left/center/right alignment, line-height multiplier and letter spacing; alignment and tracking are rendered without flattening the text. A line stores a local width/height endpoint and stroke; a polygon stores width/height, fill/stroke and an integer side count from 3 through 32. Raster layers may reference a canvas-sized alpha mask asset; optional `maskEnabled` and `maskInverted` flags default to `true` and `false`. Mask rendering, validation, transforms and source-retention rules are defined in [`layer-mask-contract.md`](./layer-mask-contract.md); masking is nondestructive and source assets remain intact. Document transforms compose affine matrices, retaining original pixels and text/vector geometry. Selections optionally retain a validated affine `matrix`; rendering applies it to geometry or canvas-sized color masks and clips the result to frame bounds. A deselected frame may retain `previousSelection` so Select > Reselect restores the editable snapshot without baking pixels.

Frames may also retain a versioned `savedSelections` book with up to 32 named,
validated snapshots. Snapshot geometry is detached when saved and loaded;
canvas-sized mask assets are retained by the document asset collector and are
validated against frame dimensions. While Quick Mask mode is active, `quickMask`
points at an immutable canvas-sized alpha asset. The editor paints new alpha
assets for undoable strokes, displays a red overlay where selected alpha is
absent, and converts the final alpha back to a normal mask selection when the
mode is exited. Standalone `.pixelselection` files carry geometry and metadata;
selections that depend on canvas mask pixels remain project-local.

Raster and editable presentation layers retain nondestructive RGB curves in
`adjustments.curves`: bounded, ordered control-point lists for the composite
channel plus red, green and blue channels. Rendering compiles these curves to
8-bit lookup tables, preserves alpha (including transparent RGB data), and
leaves the source asset unchanged. Older documents omit the field and migrate
to identity curves.

Frames may also contain an optional `groups` array of editable folders. A group stores an ID, name, visibility, lock state, opacity, a validated blend value and its persisted `collapsed` panel state. Layers reference a group with `groupId`; their own source pixels, transforms and order remain unchanged. Group members render into an isolated frame-sized surface, retaining each child blend, mask, transform, style, adjustment, visibility and opacity; the group opacity and blend are then applied once at the first member stacking slot. Group locks prevent edits to member layers. Folder creation, rename, collapse/expand, visibility, opacity, blend, lock and ungroup actions are undoable and survive local/portable/cloud round trips. See [`group-compositing-contract.md`](./group-compositing-contract.md) for bounds, non-contiguous members and progress behavior.

Frames may also contain an optional bounded `artboards` array (at most eight
named viewports) and an `activeArtboardId`. Each artboard stores only an ID,
name, integer frame-space rectangle, visibility/lock flags and an optional
solid background swatch. Artboards are validated against the containing frame,
are transformed with canvas geometry operations, and are dropped when a crop
removes their entire rectangle. The active named artboard can now be selected
in the export dialog, rendered into a fresh pixel-aligned viewport and exported
as PNG, JPEG or WebP without mutating the source frame; transparent pixels use
the artboard's optional solid background swatch. Legacy frames without this
metadata expose a virtual locked `Canvas` viewport through the
`effectiveArtboards` helper and continue to export at their original
dimensions. This bounded viewport export composites the document once and
crops the selected rectangle; it does not claim independent multi-canvas
compositing, per-artboard layer visibility, or full document tiled rendering.

Available in this milestone: raster/image/paint layers; editable text with four system typefaces, multiline alignment, editable box width, line-height and letter spacing; editable rectangular, elliptical, line and regular polygon shapes; rectangular, elliptical, single-row and single-column one-pixel marquee selections plus freehand and click-to-place polygonal lasso selections with invert, nondestructive raster masks, affine Transform Selection, **Edit → Free Transform for unlocked active layers**, constrained **Edit → Content-Aware Fill** cleanup over a persisted layer-local selection mask, Select > Reselect snapshots, Quick Mask and named saved selections; layer selection, naming, visibility, locking, ordering, duplication, deletion, position, opacity and seven blend modes; nondestructive per-layer brightness, contrast, saturation, hue rotation (-180°..180°), blur, preset filters, **Box Blur and Gaussian Blur with editable alpha-aware `filterEffects` metadata**, bounded radial **Pinch** and directional **Wave** distortions with editable centre/radius or wavelength/angle, input/output Levels (black point, white point, gamma and output range) and RGB/per-channel Curves adjustments; undo/redo; image resize, crop, rotate and flip preserving layers; rasterization explicitly requested by the user. Move drags the selected layer. Free Transform applies a validated affine delta around the layer's local painted centre, preserving the immutable source asset and canvas-space mask; its numeric dialog accepts locale decimal commas, bounded scale/rotation/skew and horizontal/vertical flips. Painting on text or a shape requires a paint layer or explicit rasterization. Crop changes the canvas bounds, retaining pixels outside them in the project. Polygon sides, line endpoints, fill/stroke settings, layer transform bounds/matrices, selection matrices, Reselect snapshots, text metrics, hue bounds, Levels input/output ranges, curve control points, blur/Pinch/Wave effect bounds and constrained cleanup mask references are validated and survive undo, reload and project round trips. Hue rotation, Levels, Curves, Blur, Pinch, Wave and Content-Aware Fill remap rendered raster pixels only; the immutable source asset remains unchanged.

Version 1 files migrate to background raster layers with the old snapshot history intact. Opening a local version 1 bookmark creates a new local version 2 draft, retaining the original record and URL. Imported files open as a new draft. Every history asset is validated and decoded before replacing the current document. Unknown document versions and malformed references are rejected. Cloud projects accept versions 1 and 2 with the same owner/session and generation preconditions.

Limits: 32 layers and 32 groups, 16 megapixels per canvas or image asset, 64 megapixels of raster layers in any frame, at most 24 undo frames, and at most 10,000 vertices in one persisted polygon selection. History trims from the oldest frame when referenced PNG data exceeds 32 MiB; the current frame can retain up to 64 MiB. Decoded image cache is limited to 64 megapixels. Portable files are limited to 64 MiB; private cloud documents retain the existing 16 MiB request limit. These are browser-safety limits, not an industrial-scale performance claim.

The renderer uses Canvas 2D; tested browser coverage is Chromium desktop and mobile. System font metrics may differ across platforms. PSD, CMYK, RAW, non-contiguous color selections, magnetic lasso, pressure curves, tiled workers, color-managed export and batch processing remain outstanding. This milestone does not claim Photoshop compatibility or professional parity.

Next gates: perspective/mesh transforms, structured selections/masks, command coalescing and durable blob storage, explicit large-image performance budgets, cross-browser pixel/format tests, then advanced tools. No lossy PSD import should be presented as a faithful round trip.

Local persistence also uses an atomic IndexedDB revision comparison. A stale tab cannot overwrite or discard a newer stored draft. Saves within one tab are queued; the saved indicator follows transaction completion. When a conflict is detected, the editor keeps the in-memory edits and offers **Reload newer draft**, which adopts only a strictly higher stored `localRevision` after schema validation, or **Save local copy**, which creates a separate bookmark and clears its cloud-update link. Equal or older records are rejected during recovery so a racing read cannot erase current work. `localRevision` is storage metadata and is omitted from portable/cloud documents.
