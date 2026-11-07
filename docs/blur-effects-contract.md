# Local blur effects contract

PixelForge's Filter → Blur family includes fifteen local, nondestructive effects:
**Average**, **Blur More**, **Box Blur…**, **Gaussian Blur…**, **Lens Blur…**, **Iris Blur…**, **Smart Blur…**, **Surface Blur…**, **Shape Blur…**, **Motion Blur…**, **Radial Blur…**, **Field
Blur…**, **Path Blur…** and **Spin Blur…**. Each effect is stored on the selected
layer as `adjustments.filterEffects`, so changing or clearing the effect never
rewrites the immutable raster asset.

The metadata record uses the existing validated effect shape:

- `type` is `average-blur`, `blur-more`, `box-blur`, `gaussian-blur`, `lens-blur`, `iris-blur`, `smart-blur`, `surface-blur`, `shape-blur`, `motion-blur`, `radial-blur`, `spin-blur` or `path-blur`.
- `amount` is a 0–100 blend percentage. Zero is an identity operation.
- `radius` is an integer source-pixel radius from 0–64. Zero is an identity
  operation and the inspector exposes the value as **Blur radius**. Radial
  Blur and Spin Blur use the same bounded field as degrees of **Angular sweep**;
  Path Blur uses it as bounded path length.
- `angle`, `centerX`, `centerY` and `seed` remain serialized for the shared
  filter schema and are normalized at every document boundary.

Average Blur computes one alpha-weighted global RGB mean from covered source pixels and blends each covered destination toward it. It preserves source alpha, leaves transparent RGB padding untouched, and uses the same bounded amount field as the other local effects. The source is copied before rendering, so the operation is deterministic and remains editable in layer metadata.

Blur More is a one-click stronger box blur. It doubles the bounded source-pixel radius before using the same alpha-aware box kernel and amount blend as Box Blur, while preserving source alpha, transparent RGB padding, immutable assets and editable metadata.

Box Blur uses a separable running-sum kernel. Gaussian Blur uses a separable,
normalized Gaussian kernel with `sigma = max(0.5, radius / 3)`. Both kernels
weight RGB by neighbouring alpha and renormalize the available samples at
image edges. They retain every source alpha byte and leave fully transparent
RGB padding unchanged, which avoids dark halos around cutouts. The renderer
always copies the source before writing output, is deterministic for a given
metadata record, and is applied in layer-local coordinates after decoding the
immutable source asset. Layer transforms and masks therefore remain editable.

Motion Blur samples a symmetric, nearest-neighbour line through each covered
pixel. Its bounded radius is the same 0–64 source-pixel field and its angle is
an editable -180–180 degree direction. Samples are weighted by alpha, so
transparent padding cannot darken the result; destination alpha and hidden RGB
remain unchanged. The directional kernel is local and deterministic, with no
remote processing or source upload.

Lens Blur integrates a fixed 49-sample circular aperture using a golden-angle
point set. It is deliberately labeled a local approximation: no depth map,
occlusion ordering, specular highlight reconstruction or camera simulation is
inferred. Iris Blur applies the alpha-aware box kernel through a smooth
elliptical focal mask centred at `centerX`/`centerY`; pixels near the focal
ellipse stay sharp while the outside ramps toward the requested blur. Both
effects preserve destination alpha and transparent RGB padding, remain
editable in metadata, and are bounded for tiny images and large radius values.

Smart Blur uses a bounded bilateral kernel (spatial distance multiplied by
luminance similarity) to soften flat regions while retaining strong tonal
boundaries. It is a local approximation with no semantic segmentation or
depth inference; radius is capped at eight sampling pixels for predictable
interactive budgets. Source alpha and transparent RGB padding remain stable.

Surface Blur uses a bounded inverse-distance kernel with a hard luminance
threshold. Samples from a different tonal surface are excluded entirely,
which keeps a strong boundary crisper than a general blur while smoothing
nearby pixels on the same surface. It is likewise a local approximation with
no semantic segmentation or depth inference, and preserves source alpha and
transparent RGB padding.

Shape Blur uses a deterministic diamond aperture: samples are included when
their Manhattan distance from the destination is within the bounded radius,
with nearer samples weighted more heavily. This gives a stable non-circular
shape variant while custom user-supplied kernels and the full Photoshop shape
preset library remain future work.

Implementation note (`src/fastNeighborhoodFilters.ts`): Smart, Surface and
Shape Blur, Lens, Radial, Spin and Path Blur (plus Smart Sharpen and Reduce
Noise) use rewritten kernels whose output is pinned to the previous per-pixel
code by `tests/fast-remaining-filters.test.mjs`. Surface Blur, Reduce Noise,
Lens Blur, zoom Radial Blur and both Path Blur modes are byte-identical.
Smart Blur factors its range weight into per-pixel exponentials and Shape Blur
sums exact integers (each kernel row is a 1-D tent read from double prefix
sums), so a channel may round one level differently from the old
floating-point sums. Spin Radial Blur and Spin Blur rotate the centre offset
with a cosine/sine table, so only a sample that sits on a pixel-rounding tie
may pick the neighbouring source pixel. Tiled and full-frame renders remain
identical.

Radial Blur is the spin variant: seventeen samples follow each covered
pixel's polar ring around the editable **Blur center X/Y**. The centre uses
normalized 0–1 coordinates and defaults to the centre of the source layer;
the exact centre pixel remains unchanged. Angular sweep is bounded at
0–64 degrees, with zero and zero amount producing exact identity copies.
The effect weights samples by alpha, retains destination alpha and hidden
transparent RGB, clamps samples to source bounds, and runs with a fixed sample
count independent of the sweep. This is a local spin effect; zoom-style Radial
Blur and Blur Gallery multi-pin controls remain separate planned capabilities.

Spin Blur uses the same fixed-sample polar integration as Radial Blur under a
separate `spin-blur` type so gallery intent survives project interchange. New
Spin records can scope that sampling to a rotated, feathered ellipse. Path
Blur accepts a persisted two-to-eight-point normalized polyline and
per-endpoint speed values, then integrates source-only samples along the
nearest segment with optional centered/tapered controls. Both are explicit
local approximations: shape guides, rear-sync flash, strobe controls, depth
maps, bokeh/highlight reconstruction and camera-style focus simulation remain
planned. See [`path-spin-blur-contract.md`](./path-spin-blur-contract.md).

The pure filter suite covers normalization and strict validation, identity and
one-pixel bounds, deterministic repeatability, source immutability, opaque and
transparent alpha edges, hidden RGB padding, and representative Average/Box/Gaussian/
Motion/Radial/Spin/Path kernel output. Radial and Spin fixtures also cover centre changes, corner
centres, constant colour, partial-alpha neighbours, one-pixel/one-column bounds,
zero amount/sweep and fixed-buffer source preservation. The desktop/mobile browser suite covers enabled menu
commands, inspector editing, angle/radius controls, undo-compatible history
metadata, source-asset retention, alpha preservation, reload and project-
download round trips. Radial, Spin and Path acceptance explicitly checks reload,
project import, editable centre/sweep/direction metadata and undo restoration.
These checks run in both Playwright projects (`desktop` and `mobile`).
