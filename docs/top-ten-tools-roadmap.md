# Ten high-use Photoshop workflows

PixelForge prioritizes the workflows people use to change an image predictably,
then layers in creative and automation features. This is an evidence-based
priority list, not a claim that Adobe publishes tool-click telemetry. A 2025
study of 82,976 real `/r/PhotoshopRequest` requests found **delete** (32.9%),
**adjust**, and **add** were the three largest requested outcomes; 55.5% of the
requests were low-creativity, precision edits. The study measures desired
outcomes rather than menu frequency, but it is a useful demand signal for a
free editor. See the [PSR study](https://arxiv.org/html/2505.16181v1#S3.SS3).

## Applied core ten

| Priority | Workflow | PixelForge status | Acceptance gate |
| --- | --- | --- | --- |
| 1 | Remove and retouch | Clone, Healing, **Patch**, bounded selection-based **Content-Aware Fill**, Red Eye, Remove Background, nondestructive **Mask Brush/Mask Eraser** refinement, Dodge, Burn, Sponge, Smudge and bounded local Spot Healing are local, source-safe operations. Content-Aware Move and semantic object removal remain staged. Patch, mask refinement and Content-Aware Fill use local source context and do not claim semantic or generative inference. | Immutable source, alpha-safe pixels, pressure/radius bounds, persisted masks, undo and reload on desktop/mobile |
| 2 | Layers and masks | Raster/image/paint layers, folders, visibility, opacity, locking, ordering, blend modes, merge/flatten, raster masks and selection masks are persisted. **Layer → Merge Layers now combines the active layer with the immediately lower visible, unlocked, ungrouped layer through the normal render pipeline; grouped-pair merge semantics remain guarded pending a dedicated isolated-folder merge contract.** | Composite fixtures, folder and mask guards, merged-pair pixel/alpha equivalence, source retention, hidden-layer preservation, malformed-document rejection, reload, undo/redo and desktop/mobile menu acceptance |
| 3 | Light and color | Brightness, Contrast, Saturation, Hue, input/output Levels, Curves, Color Balance, local signed-stop Exposure, Vibrance, Rec. 709 Black & White, Auto Tone/Contrast/Color, and deterministic Sharpen/Noise controls are active. The photo controls are practical local corrections rather than RAW/linear-light or Adobe algorithm parity. | Bounded metadata, deterministic pixels, alpha and hidden-RGB preservation, history and project round trip |
| 4 | Precise selections | Marquee variants, Lasso/Polygonal/Magnetic Lasso, Magic Wand, Color Range, Selection Brush, refinement, feather, grow/contract/border, invert, Quick Mask and named selections are active. | Binary/soft mask fixtures, composition, transparency, gesture cancellation, keyboard and desktop/mobile persistence |
| 5 | Crop and transform | Crop, Perspective Crop, Slice, Image/Canvas Size, trim, rotate/flip, Free Transform, Selection Transform, Move, Hand and Zoom are active. | Matrix/bounds math, non-destructive crop recovery, exact dimensions, touch/keyboard cancellation and undo |
| 6 | Brush and painting | Brush, Pencil, Color Replacement, Gradient, Paint Bucket, pressure-aware erasing and Pattern Stamp are active. Brush/Pencil also expose four bounded local presets with spacing, angle, roundness and tip-mirror controls. Mixer/History/Art History, scattering/texture dynamics and advanced stabilization remain staged. | Replayed pointer samples, pressure fallback, hardness/flow/opacity, elliptical tip geometry, spacing, preset validation, deterministic raster snapshots and latency budget |
| 7 | Type, shapes and paths | Editable horizontal/vertical text, paragraph metrics, Pen, Direct Selection, Rectangle, Ellipse, Line, Polygon, Triangle and Star are active. Warp/OpenType and boolean shape operations remain staged. | Font fallback, text metrics, path hit testing, vector serialization, exact fill/stroke and export pixels |
| 8 | Nondestructive filters | Field, Box, Gaussian, Motion and spin-style Radial Blur, Tilt-Shift, Mosaic, Halftone, **Pinch, Wave**, Ripple, Twirl, Sharpen and Noise are active with validated metadata. Most Photoshop gallery families remain staged. | Deterministic kernels and inverse maps, alpha-safe transparent edges, parameter bounds, cancellation, source retention, undo/reload and desktop/mobile tests |
| 9 | Export, import and projects | PNG/JPEG/WebP export, target-size controls, project JSON, batch export, named-artboard viewport export, local drafts and optional private-cloud projects are active. PSD/PSB, RAW, TIFF/PDF/SVG round trips and full color management remain staged. | Signature/dimension checks, quality and target-size bounds, privacy manifest, cancellation, draft recovery and artboard pixel fixtures |
| 10 | Repeatable workflows | Batch image export, reusable project state, local recorded Actions and **parameterized local Action batches** are active. Folder watchers, plugin APIs and synchronized cloud recipes remain staged. | Deterministic replay, idempotence, per-file failure isolation, bounded queue/memory use, cancellation, privacy manifest and permission boundaries |

Every applied workflow has pure validation/pixel coverage where its engine is
deterministic and desktop/mobile browser acceptance for its user-facing path.
Each new control must preserve anonymous free editing, local draft/bookmark
recovery, optional Cheaply authentication, undoability and source assets.

## Sequencing after the ten

The constrained content-aware object-cleanup slice is now available through
`Edit → Content-Aware Fill…`. It requires an explicit selection, persists a
layer-local mask and uses a deterministic median of nearby unselected pixels;
the source asset and alpha remain unchanged. It does not claim semantic
object detection, generative fill or Content-Aware Move. Parameterized batch
Actions follow this slice. The local Patch Tool remains available for
deterministic source-offset cleanup.
Smart Objects, Camera Raw, richer filters, ICC/HDR, tiled
compositing and optional reviewable AI remain separate milestones. AI edits must
stay optional, previewable and undoable: the PSR study found current AI editors
fulfilled only about one third of real requests and often changed identity or
made unrequested edits.

The ten workflows are aligned with Adobe's own [Photoshop certification
objectives](https://certifiedprofessional.adobe.com/photoshop) and its
[non-destructive editing guidance](https://helpx.adobe.com/photoshop/using/nondestructive-editing.html),
while keeping implementation claims limited to features covered by tests.
